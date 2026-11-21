using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.IO;
using System.Management;
using System.Threading;
using System.Web.Script.Serialization;
using Microsoft.Win32;

// Runs with the application's existing token. It never elevates or executes a
// command read from userData; the only writable registry values are allowlisted.
static class NetworkWatchdog
{
    static readonly string[] Names = { "ProxyServer", "ProxyOverride", "AutoConfigURL", "ProxyEnable" };
    static readonly List<Process> Cores = new List<Process>();
    static readonly ManualResetEvent ParentGone = new ManualResetEvent(false);

    [DllImport("wininet.dll", SetLastError = true)]
    static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);

    const int INTERNET_OPTION_REFRESH = 37;
    const int INTERNET_OPTION_SETTINGS_CHANGED = 39;

    static void RefreshInternetSettings()
    {
        InternetSetOption(IntPtr.Zero, INTERNET_OPTION_SETTINGS_CHANGED, IntPtr.Zero, 0);
        InternetSetOption(IntPtr.Zero, INTERNET_OPTION_REFRESH, IntPtr.Zero, 0);
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder name, ref int size);

    static string ExecutablePath(Process process)
    {
        // MainModule depends on the child's loader having initialized its module
        // list. The kernel image path is available immediately after creation.
        var name = new StringBuilder(32768);
        int size = name.Capacity;
        if (!QueryFullProcessImageName(process.Handle, 0, name, ref size))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        return name.ToString();
    }

    static bool SamePath(string a, string b)
    {
        return string.Equals(Path.GetFullPath(a), Path.GetFullPath(b), StringComparison.OrdinalIgnoreCase);
    }

    static FileStream LockSession(string filename)
    {
        for (int attempt = 0; ; attempt++)
        {
            try { return new FileStream(filename, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); }
            catch (IOException) { if (attempt >= 200) throw; Thread.Sleep(100); }
        }
    }

    static void RestoreProxy(string filename, string registryPath)
    {
        if (!File.Exists(filename)) return;
        var serializer = new JavaScriptSerializer { MaxJsonLength = 65536 };
        var journal = serializer.Deserialize<Dictionary<string, object>>(File.ReadAllText(filename));
        if (Convert.ToInt32(journal["version"]) != 1) throw new InvalidDataException("Invalid proxy journal");
        var values = (Dictionary<string, object>)journal["values"];
        // Validate everything before touching the registry.
        foreach (string name in Names)
        {
            object raw = values[name];
            if (raw == null) continue;
            var value = (Dictionary<string, object>)raw;
            string type = (string)value["type"], data = (string)value["data"];
            if (type != "REG_SZ" && type != "REG_EXPAND_SZ" && type != "REG_DWORD")
                throw new InvalidDataException("Invalid registry type");
            if (type == "REG_DWORD") ParseDword(data);
        }
        using (RegistryKey key = Registry.CurrentUser.OpenSubKey(registryPath, true))
        {
            if (key == null) throw new IOException("Internet Settings key not found");
            foreach (string name in Names)
            {
                object raw = values[name];
                if (raw == null) { key.DeleteValue(name, false); continue; }
                var value = (Dictionary<string, object>)raw;
                string type = (string)value["type"], data = (string)value["data"];
                if (type == "REG_DWORD") key.SetValue(name, ParseDword(data), RegistryValueKind.DWord);
                else key.SetValue(name, data, type == "REG_SZ" ? RegistryValueKind.String : RegistryValueKind.ExpandString);
            }
            key.Flush();
        }
        RefreshInternetSettings();
        File.Delete(filename);
    }

    static int ParseDword(string data)
    {
        return data.StartsWith("0x", StringComparison.OrdinalIgnoreCase)
            ? unchecked((int)Convert.ToUInt32(data.Substring(2), 16)) : unchecked((int)Convert.ToUInt32(data));
    }

    static void TrackCore(int pid, string[] executables, DateTime parentStarted)
    {
        Process core = Process.GetProcessById(pid);
        try
        {
            // Open a process handle now; never kill by a recycled PID later.
            IntPtr handle = core.Handle;
            string executable = ExecutablePath(core);
            bool allowed = false;
            foreach (string candidate in executables)
                if (SamePath(executable, candidate)) { allowed = true; break; }
            if (!allowed || core.StartTime.ToUniversalTime() < parentStarted)
                throw new InvalidDataException("Unexpected core process");
            lock (Cores)
            {
                for (int i = Cores.Count - 1; i >= 0; i--)
                    if (Cores[i].HasExited) { Cores[i].Dispose(); Cores.RemoveAt(i); }
                Cores.Add(core);
            }
        }
        catch { core.Dispose(); throw; }
    }

    static int Main(string[] args)
    {
        if (args.Length != 5) return 1;
        try
        {
            using (Process parent = Process.GetProcessById(int.Parse(args[0])))
            {
                IntPtr handle = parent.Handle;
                if (!SamePath(ExecutablePath(parent), args[1])) return 1;
                DateTime started = parent.StartTime.ToUniversalTime();
                string directory = Path.GetFullPath(args[3]);
                // The parent resolves the protected core store. Keep its exact
                // channel paths alongside the bundled core in the allowlist.
                string cores = Path.GetFullPath(args[4]);
                string[] executables = {
                    args[2],
                    Path.Combine(cores, "stable", "mihomo.exe"),
                    Path.Combine(cores, "alpha", "mihomo.exe")
                };
                using (FileStream session = LockSession(Path.Combine(directory, "network-session.lock")))
                {
                    var waiter = new Thread(delegate() { try { parent.WaitForExit(); } catch { } finally { ParentGone.Set(); } });
                    waiter.IsBackground = true;
                    waiter.Start();
                    var reader = new Thread(delegate()
                    {
                        try
                        {
                            string line;
                            while ((line = Console.ReadLine()) != null)
                            {
                                if (line.Length > 64) break;
                                int pid;
                                if (!int.TryParse(line, out pid) || pid <= 0) break;
                                try { TrackCore(pid, executables, started); Console.WriteLine("CORE " + pid); Console.Out.Flush(); }
                                catch (Exception error)
                                {
                                    Console.Error.WriteLine("Unable to track core " + pid + ": " + error);
                                    Console.WriteLine("ERROR " + pid); Console.Out.Flush();
                                }
                            }
                        }
                        catch (IOException) { /* The parent closed its pipes while exiting. */ }
                        finally { ParentGone.Set(); }
                    });
                    reader.IsBackground = true;
                    reader.Start();
                    Console.WriteLine("READY");
                    Console.Out.Flush();
                    ParentGone.WaitOne();
                    // Cover a parent dying between spawn() and registration.
                    // Match ancestry, executable and creation time before opening
                    // a stable handle; unrelated processes must never be killed.
                    try
                    {
                        using (var search = new ManagementObjectSearcher("SELECT ProcessId FROM Win32_Process WHERE ParentProcessId = " + parent.Id))
                        using (var children = search.Get())
                        {
                            foreach (ManagementObject child in children)
                            {
                                try { TrackCore(Convert.ToInt32(child["ProcessId"]), executables, started); }
                                catch { /* A child may already have exited. */ }
                                finally { child.Dispose(); }
                            }
                        }
                    }
                    catch (Exception error) { Console.Error.WriteLine("Child discovery failed: " + error.Message); }
                    bool stopped = true;
                    lock (Cores)
                    {
                        foreach (Process core in Cores)
                        {
                            try { if (!core.HasExited) { core.Kill(); if (!core.WaitForExit(5000)) stopped = false; } }
                            catch { stopped = false; }
                            finally { core.Dispose(); }
                        }
                    }
                    // Keep the journal on failure; the next startup will retry it.
                    RestoreProxy(Path.Combine(directory, "system-proxy-recovery.json"), @"Software\Microsoft\Windows\CurrentVersion\Internet Settings");
                    return stopped ? 0 : 1;
                }
            }
        }
        catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
    }
}
