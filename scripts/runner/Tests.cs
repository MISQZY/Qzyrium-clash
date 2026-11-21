using System;
using System.IO;
using System.Reflection;
using System.Security.AccessControl;
using System.Security.Principal;

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
        string target = Path.Combine(args[0], "Qzyrium-clash.exe");
        if ((bool)Invoke("MatchesInstallation", target))
            throw new Exception("Missing application accepted");
        File.WriteAllText(target, "test fixture");
        if ((bool)Invoke("MatchesInstallation", target))
            throw new Exception("User-writable installation accepted for elevation");
        var acl = new DirectorySecurity();
        acl.SetOwner(new SecurityIdentifier("S-1-5-32-544"));
        acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier("S-1-5-32-544"), FileSystemRights.FullControl, AccessControlType.Allow));
        acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier("S-1-5-32-545"), FileSystemRights.ReadAndExecute, AccessControlType.Allow));
        if (!(bool)Invoke("TrustedAcl", acl, false)) throw new Exception("Protected ACL rejected");
        acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier("S-1-5-32-545"), FileSystemRights.CreateDirectories, AccessControlType.Allow));
        if ((bool)Invoke("TrustedAcl", acl, false)) throw new Exception("Writable runtime directory accepted");
        if (!(bool)Invoke("TrustedAcl", acl, true)) throw new Exception("Safe ProgramData ancestor rejected");
        acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier("S-1-5-32-545"), FileSystemRights.DeleteSubdirectoriesAndFiles, AccessControlType.Allow));
        if ((bool)Invoke("TrustedAcl", acl, true)) throw new Exception("Replaceable parent directory accepted");
        var userOwned = new DirectorySecurity();
        userOwned.SetOwner(WindowsIdentity.GetCurrent().User);
        userOwned.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier("S-1-5-32-545"), FileSystemRights.ReadAndExecute, AccessControlType.Allow));
        if ((bool)Invoke("TrustedAcl", userOwned, false)) throw new Exception("Unprivileged owner accepted");
        foreach (string generic in new[] { "GA", "GW" })
        {
            var genericAcl = new DirectorySecurity();
            genericAcl.SetSecurityDescriptorSddlForm("O:BAG:BAD:(A;;" + generic + ";;;AU)");
            if ((bool)Invoke("TrustedAcl", genericAcl, false)) throw new Exception("Generic write rights accepted: " + generic);
        }
        string windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        string systemLibrary = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "kernel32.dll");
        if (!(bool)Invoke("ProtectedPath", systemLibrary, windows)) throw new Exception("Protected Windows file rejected");
        string foreignTarget = Path.Combine(args[0], "other.exe");
        File.WriteAllText(foreignTarget, "test fixture");
        if ((bool)Invoke("MatchesInstallation", foreignTarget))
            throw new Exception("Foreign executable accepted");
        string foreignDirectory = Path.Combine(args[0], "other");
        Directory.CreateDirectory(foreignDirectory);
        foreignTarget = Path.Combine(foreignDirectory, "Qzyrium-clash.exe");
        File.WriteAllText(foreignTarget, "test fixture");
        if ((bool)Invoke("MatchesInstallation", foreignTarget))
            throw new Exception("Foreign installation accepted");
    }
}
