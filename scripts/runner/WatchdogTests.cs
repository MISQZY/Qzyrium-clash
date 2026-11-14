using System;
using System.IO;
using System.Reflection;
using System.Diagnostics;
using System.Threading;
using Microsoft.Win32;

static class WatchdogTests
{
    static void Main(string[] args)
    {
        if (args[0] == "--core") { Thread.Sleep(60000); return; }
        var flags = BindingFlags.Static | BindingFlags.NonPublic;
        MethodInfo track = typeof(NetworkWatchdog).GetMethod("TrackCore", flags);
        string executable = Process.GetCurrentProcess().MainModule.FileName;
        for (int attempt = 0; attempt < 50; attempt++)
        {
            using (Process core = Process.Start(new ProcessStartInfo(executable, "--core") { UseShellExecute = false, CreateNoWindow = true }))
            {
                try { track.Invoke(null, new object[] { core.Id, executable, DateTime.UtcNow.AddMinutes(-1) }); }
                finally { if (!core.HasExited) core.Kill(); core.WaitForExit(); }
            }
        }
        MethodInfo restore = typeof(NetworkWatchdog).GetMethod("RestoreProxy", flags);
        string registryPath = @"Software\QzyriumWatchdogTests\" + Guid.NewGuid().ToString("N");
        string filename = Path.Combine(args[0], "proxy-test.json");
        try
        {
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(registryPath))
            {
                key.SetValue("ProxyEnable", 1);
                key.SetValue("ProxyServer", "app:1234");
                key.SetValue("ProxyOverride", "app");
                key.SetValue("AutoConfigURL", "app");
            }
            File.WriteAllText(filename, "{\"version\":1,\"values\":{\"ProxyEnable\":{\"type\":\"REG_DWORD\",\"data\":\"0x1\"},\"ProxyServer\":{\"type\":\"REG_SZ\",\"data\":\"company:8080\"},\"ProxyOverride\":null,\"AutoConfigURL\":{\"type\":\"REG_EXPAND_SZ\",\"data\":\"%USERPROFILE%/proxy.pac\"}}}");
            restore.Invoke(null, new object[] { filename, registryPath });
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(registryPath))
            {
                if ((int)key.GetValue("ProxyEnable") != 1 || (string)key.GetValue("ProxyServer") != "company:8080" || key.GetValue("ProxyOverride") != null || key.GetValueKind("AutoConfigURL") != RegistryValueKind.ExpandString)
                    throw new Exception("Original proxy values/types were not restored");
            }
            if (File.Exists(filename)) throw new Exception("Successful recovery retained its journal");
            File.WriteAllText(filename, "{broken");
            bool rejected = false;
            try { restore.Invoke(null, new object[] { filename, registryPath }); }
            catch (TargetInvocationException) { rejected = true; }
            if (!rejected || !File.Exists(filename)) throw new Exception("Invalid journal must be retained");
        }
        finally { Registry.CurrentUser.DeleteSubKeyTree(registryPath, false); }
    }
}
