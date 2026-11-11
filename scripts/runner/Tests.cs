using System;
using System.IO;
using System.Reflection;

static class RunnerTests
{
    static object Invoke(string name, params object[] args)
    {
        return typeof(QzyriumRunner.Program).GetMethod(name, BindingFlags.Static | BindingFlags.NonPublic).Invoke(null, args);
    }

    static void Main(string[] args)
    {
        string filename = Path.Combine(args[0], "params.txt");
        foreach (string unsupported in new[] { "--inspect=9229", "--app=evil", "qzyrium://url\" --inspect=9229", new string('a', 17000) })
        {
            File.WriteAllText(filename, unsupported);
            bool rejected = false;
            try { Invoke("ReadArguments", filename); }
            catch (TargetInvocationException) { rejected = true; }
            if (!rejected) throw new Exception("Accepted privileged argument: " + unsupported);
        }
        File.WriteAllText(filename, "--admin-restart=123\nqzyrium://install-config?name=Hello World\n");
        if ((string)Invoke("ReadArguments", filename) != "--admin-restart=123 \"qzyrium://install-config?name=Hello World\"")
            throw new Exception("Protocol/PID arguments must preserve boundaries");
        if (File.Exists(filename)) throw new Exception("Parameters must be consumed once");
        if ((bool)Invoke("SafeInstallation", Path.Combine(args[0], "Qzyrium-clash.exe")))
            throw new Exception("Untrusted install accepted");
        if ((bool)Invoke("ProtectedTree", new DirectoryInfo(args[0])))
            throw new Exception("User-writable directory accepted");
    }
}
