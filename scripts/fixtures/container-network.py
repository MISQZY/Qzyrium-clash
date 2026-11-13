"""Controlled HTTP proxy/DNS peer and a real Mihomo crash probe, Linux only."""
import difflib
import hashlib
import http.client
import http.server
import json
import os
import selectors
import shutil
import signal
import socket
import socketserver
import struct
import subprocess
import sys
import threading
import time
from pathlib import Path

TARGET = "203.0.113.10"
DEVICE = "qzyrium-test"


def ip(*args):
    return subprocess.check_output(["ip", *args], text=True).strip()


def dns_query(host):
    question = b"".join(bytes([len(part)]) + part.encode() for part in "probe.qzyrium.test".split(".")) + b"\x00\x00\x01\x00\x01"
    packet = struct.pack("!6H", 1234, 0x100, 1, 0, 0, 0) + question
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as client:
        client.settimeout(3)
        client.sendto(packet, (host, 53))
        answer = client.recv(2048)
        assert answer[:2] == packet[:2] and answer[-4:] == socket.inet_aton(TARGET), "unexpected DNS answer"


def request(host, port=8080, path="/"):
    connection = http.client.HTTPConnection(host, port, timeout=4)
    try:
        connection.request("GET", path)
        response = connection.getresponse()
        if response.status != 200:
            raise http.client.HTTPException(f"HTTP {response.status}: {response.reason}")
        return response.read().decode()
    finally:
        connection.close()


def peer():
    ip("addr", "add", TARGET + "/32", "dev", "lo")
    counts = {"connects": 0}

    class Target(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            data = json.dumps(counts).encode() if self.path == "/stats" else b"qzyrium-controlled-target"
            self.send_response(200)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *_args):
            pass

    class Proxy(socketserver.BaseRequestHandler):
        def handle(self):
            header = b""
            self.request.settimeout(5)
            while b"\r\n\r\n" not in header:
                chunk = self.request.recv(1)
                if not chunk or len(header) > 16384:
                    return
                header += chunk
            method, destination, _version = header.split(b"\r\n", 1)[0].decode().split()
            assert method == "CONNECT"
            host, port = destination.rsplit(":", 1)
            # No arbitrary outbound destinations, subscriptions or credentials.
            assert host == TARGET and int(port) == 8080
            with socket.create_connection((host, int(port)), timeout=4) as remote:
                counts["connects"] += 1
                self.request.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                with selectors.DefaultSelector() as selector:
                    selector.register(self.request, selectors.EVENT_READ, remote)
                    selector.register(remote, selectors.EVENT_READ, self.request)
                    while True:
                        ready = selector.select(5)
                        if not ready:
                            return
                        for key, _events in ready:
                            data = key.fileobj.recv(65536)
                            if not data:
                                return
                            key.data.sendall(data)

    class DNS(socketserver.BaseRequestHandler):
        def handle(self):
            data, transport = self.request
            header = data[:2] + struct.pack("!5H", 0x8180, 1, 1, 0, 0)
            answer = b"\xc0\x0c" + struct.pack("!HHIH", 1, 1, 5, 4) + socket.inet_aton(TARGET)
            transport.sendto(header + data[12:] + answer, self.client_address)

    servers = [http.server.ThreadingHTTPServer(("0.0.0.0", 8080), Target),
               socketserver.ThreadingTCPServer(("0.0.0.0", 8888), Proxy),
               socketserver.ThreadingUDPServer(("0.0.0.0", 53), DNS)]
    for server in servers:
        threading.Thread(target=server.serve_forever, daemon=True).start()
    print("READY", flush=True)
    threading.Event().wait()


def snapshot():
    return {"interfaces": sorted(os.listdir("/sys/class/net")),
            "routes": ip("route", "show", "table", "all"), "rules": ip("rule", "show"),
            "rules6": ip("-6", "rule", "show")}


def probe(peer_ip, mode, expected_hash, termination, supervision):
    assert termination in ("SIGTERM", "SIGKILL", "PARENT_SIGKILL")
    case = mode + "-" + termination.lower()
    report = {"scope": "Linux Mihomo " + supervision + ", not Windows Electron/watchdog/system proxy", "mode": mode,
              "termination": termination, "checks": []}
    core = None
    work = Path("/tmp/mihomo-test")
    work.mkdir()
    destination = work / "mihomo"
    binary = Path("/fixtures/mihomo").read_bytes()
    assert hashlib.sha256(binary).hexdigest() == expected_hash
    shutil.copyfile("/fixtures/mihomo", destination)
    destination.chmod(0o755)
    config = {"mixed-port": 7895, "external-controller": "127.0.0.1:9095", "secret": "container-test-only",
              "mode": "rule", "log-level": "info", "ipv6": False,
              "proxies": [{"name": "TEST", "type": "http", "server": peer_ip, "port": 8888}],
              "proxy-groups": [{"name": "PROXY", "type": "select", "proxies": ["TEST"]}],
              "rules": ["MATCH,PROXY"],
              "dns": {"enable": True, "listen": "127.0.0.1:1053", "enhanced-mode": "redir-host",
                      "nameserver": ["udp://" + peer_ip + ":53"]}}
    if mode != "proxy":
        config["tun"] = {"enable": True, "device": DEVICE, "stack": mode, "auto-route": True,
                         "auto-detect-interface": True, "strict-route": True,
                         "route-address": [TARGET + "/32"], "dns-hijack": ["any:53", "tcp://any:53"]}
        if mode == "mixed":
            config["tun"].update({"iproute2-table-index": 2222, "iproute2-rule-index": 9100})
    (work / "config.json").write_text(json.dumps(config))
    # The peer owns this documentation-only address. This baseline route lives
    # exclusively in the container namespace and makes recovery observable.
    ip("route", "replace", "default", "via", peer_ip, "dev", "eth0")
    ip("rule", "add", "priority", "12000", "from", "all", "lookup", "main")
    try:
        assert request(TARGET) == "qzyrium-controlled-target"
        dns_query(peer_ip)
        report["checks"].append("baseline HTTP and DNS")
        report["before"] = snapshot()
        before_count = json.loads(request(peer_ip, path="/stats"))["connects"]
        with (Path("/results") / (case + "-core.log")).open("w") as log:
            command = [str(destination), "-d", str(work), "-f", str(work / "config.json")]
            if supervision == "supervised":
                command = ["node", "/fixtures/linux-core-supervisor.cjs", str(destination), json.dumps(config.get("tun")), *command[1:]]
            if termination == "PARENT_SIGKILL":
                core = subprocess.Popen([sys.executable, __file__, "parent", str(Path("/results") / (case + "-core.log")), *command],
                                        stdout=subprocess.PIPE, text=True)
                supervisor_pid = int(core.stdout.readline())
            else:
                core = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=log, stderr=log)
                supervisor_pid = core.pid
            deadline = time.monotonic() + 15
            while True:
                assert core.poll() is None, "Mihomo exited during startup; inspect core log"
                try:
                    with socket.create_connection(("127.0.0.1", 7895), timeout=0.2):
                        if mode == "proxy" or DEVICE in ip("route", "get", TARGET):
                            break
                except OSError:
                    pass
                assert time.monotonic() < deadline, "Mihomo did not become ready"
                time.sleep(0.1)
            # The controller/listeners can precede the gVisor TCP handler.
            # Require a successful real request before beginning crash checks.
            deadline = time.monotonic() + 10
            while True:
                try:
                    body = request("127.0.0.1", 7895, "http://" + TARGET + ":8080/") if mode == "proxy" else request(TARGET)
                    if body == "qzyrium-controlled-target" and json.loads(request(peer_ip, path="/stats"))["connects"] > before_count:
                        break
                    assert time.monotonic() < deadline, "Mihomo did not route traffic through the controlled proxy"
                    time.sleep(0.1)
                except (OSError, http.client.HTTPException):
                    if time.monotonic() >= deadline:
                        raise
                    time.sleep(0.1)
            if mode != "proxy":
                dns_query(TARGET)
            assert body == "qzyrium-controlled-target"
            assert json.loads(request(peer_ip, path="/stats"))["connects"] > before_count, "traffic bypassed the controlled proxy"
            report["checks"].append("real traffic through Mihomo and upstream HTTP CONNECT")
            report["active"] = snapshot()
            if termination == "SIGKILL" and supervision == "supervised":
                children = Path(f"/proc/{supervisor_pid}/task/{supervisor_pid}/children").read_text().split()
                assert len(children) == 1, "expected one supervised Mihomo process"
                os.kill(int(children[0]), signal.SIGKILL)
            else:
                core.send_signal(signal.SIGKILL if termination == "PARENT_SIGKILL" else getattr(signal, termination))
            core.wait(timeout=8)
            if termination == "PARENT_SIGKILL":
                deadline = time.monotonic() + 8
                while time.monotonic() < deadline:
                    try:
                        finished, _status = os.waitpid(supervisor_pid, os.WNOHANG)
                        if finished:
                            break
                    except ChildProcessError:
                        if not Path(f"/proc/{supervisor_pid}").exists():
                            break
                    time.sleep(0.1)
                else:
                    raise AssertionError("supervisor survived parent crash")
                report["checks"].append("supervisor recovered after parent SIGKILL")
            deadline = time.monotonic() + 5
            while DEVICE in os.listdir("/sys/class/net") and time.monotonic() < deadline:
                time.sleep(0.1)
            report["after"] = snapshot()
            assert DEVICE not in report["after"]["interfaces"], "TUN device survived " + termination
            if mode != "proxy":
                report["checks"].append("TUN device removed after " + termination)
            try:
                with socket.create_connection(("127.0.0.1", 7895), timeout=0.2):
                    raise AssertionError("Mihomo proxy still accepts connections after " + termination)
            except ConnectionRefusedError:
                pass
            report["checks"].append("proxy listener closed after " + termination)
            assert request(TARGET) == "qzyrium-controlled-target"
            dns_query(peer_ip)
            report["checks"].append("direct HTTP and DNS recovered")
            report["differences"] = {key: list(difflib.unified_diff(report["before"][key].splitlines(), report["after"][key].splitlines()))
                                     for key in ("routes", "rules", "rules6") if report["before"][key] != report["after"][key]}
            assert not report["differences"], "routing state differs after " + termination
            report["checks"].append("routes and policy rules match baseline")
            report["checks"].append("unrelated policy rule preserved")
        report["status"] = "passed"
    except Exception as error:
        report["status"] = "failed"
        report["error"] = str(error)
        report["failureSnapshot"] = snapshot()
    finally:
        if core is not None and core.poll() is None:
            core.terminate()
            core.wait(timeout=5)
        (Path("/results") / (case + ".json")).write_text(json.dumps(report, indent=2))
        print(json.dumps({key: value for key, value in report.items() if key not in ("before", "active", "after", "failureSnapshot")}), flush=True)
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    if sys.argv[1] == "peer":
        peer()
    elif sys.argv[1] == "parent":
        with open(sys.argv[2], "ab") as log:
            child = subprocess.Popen(sys.argv[3:], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            def relay():
                while data := child.stdout.read1(4096):
                    log.write(data)
                    log.flush()
            threading.Thread(target=relay, daemon=True).start()
            print(child.pid, flush=True)
            threading.Event().wait(120)
    else:
        sys.exit(probe(*sys.argv[2:]))
