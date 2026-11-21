using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using System.Security.AccessControl;
using System.Security.Principal;

namespace QzyriumRunner
{
    static class Program
    {
        [DllImport("wininet.dll", SetLastError = true)]
        static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);

        [DllImport("dnsapi.dll", EntryPoint = "DnsFlushResolverCache")]
        static extern int DnsFlushResolverCache();

        const int INTERNET_OPTION_REFRESH = 37;
        const int INTERNET_OPTION_SETTINGS_CHANGED = 39;

        static void RefreshInternetSettings()
        {
            InternetSetOption(IntPtr.Zero, INTERNET_OPTION_SETTINGS_CHANGED, IntPtr.Zero, 0);
            InternetSetOption(IntPtr.Zero, INTERNET_OPTION_REFRESH, IntPtr.Zero, 0);
        }

        static void FlushDnsCache()
        {
            try { DnsFlushResolverCache(); }
            catch { }
        }
        static bool TrustedOwner(SecurityIdentifier sid)
        {
            return sid.Value == "S-1-5-18" || sid.Value == "S-1-5-32-544" ||
                sid.Value == "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464";
        }

        static bool TrustedAcl(FileSystemSecurity acl, bool ancestor)
        {
            if (!TrustedOwner((SecurityIdentifier)acl.GetOwner(typeof(SecurityIdentifier)))) return false;
            if (new RawSecurityDescriptor(acl.GetSecurityDescriptorBinaryForm(), 0).DiscretionaryAcl == null) return false;
            int mask = ancestor ? 0x100D0040 : 0x500D0156;
            foreach (FileSystemAccessRule rule in acl.GetAccessRules(true, true, typeof(SecurityIdentifier)))
            {
                if (rule.AccessControlType != AccessControlType.Allow ||
                    (rule.PropagationFlags & PropagationFlags.InheritOnly) != 0) continue;
                if (!TrustedOwner((SecurityIdentifier)rule.IdentityReference) &&
                    (((int)rule.FileSystemRights & mask) != 0)) return false;
            }
            return true;
        }

        static bool ProtectedPath(string filename, string boundary)
        {
            try
            {
                FileSystemInfo item = Directory.Exists(filename) ? (FileSystemInfo)new DirectoryInfo(filename) : new FileInfo(filename);
                bool ancestor = false;
                while (item != null)
                {
                    if (!item.Exists || (item.Attributes & FileAttributes.ReparsePoint) != 0) return false;
                    var directory = item as DirectoryInfo;
                    FileSystemSecurity acl = directory != null ? (FileSystemSecurity)directory.GetAccessControl() : ((FileInfo)item).GetAccessControl();
                    if (!TrustedAcl(acl, ancestor)) return false;
                    if (string.Equals(item.FullName.TrimEnd('\\'), boundary.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) ancestor = true;
                    item = directory != null ? directory.Parent : ((FileInfo)item).Directory;
                }
                return true;
            }
            catch { return false; }
        }

        // Only protected installations may opt into persistent elevation.
        // The application verifies this runner independently before registering
        // the task; this check also protects later launches of the sibling app.
        static bool MatchesInstallation(string target)
        {
            string root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", ".."));
            return string.Equals(Path.GetFullPath(target), Path.Combine(root, "Qzyrium-clash.exe"), StringComparison.OrdinalIgnoreCase) &&
                ProtectedPath(target, root) &&
                ProtectedPath(Path.Combine(root, "resources", "app.asar"), root) &&
                ProtectedPath(typeof(Program).Assembly.Location, root);
        }

        // The parameter file is untrusted. Accept only protocol imports and the
        // old instance PID; never accept Electron/Chromium command-line switches.
        static string ReadArguments(string filename)
        {
            var arguments = new List<string>();
            using (var stream = new FileStream(filename, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                if (stream.Length > 16384) throw new InvalidDataException("Arguments too large");
                using (var reader = new StreamReader(stream))
                {
                    string line;
                    while ((line = reader.ReadLine()) != null)
                    {
                        if (Regex.IsMatch(line, @"^--admin-restart=[0-9]+$")) arguments.Add(line);
                        else if (Regex.IsMatch(line, @"^(clash|qzyrium|mihomo)://[^\r\n""\x00]+$", RegexOptions.IgnoreCase))
                        {
                            // Quote trailing backslashes using Windows argv rules.
                            arguments.Add("\"" + Regex.Replace(line, @"(\\+)$", "$1$1") + "\"");
                        }
                        else if (line.Length != 0) throw new InvalidDataException("Unsupported argument");
                    }
                }
            }
            File.Delete(filename);
            return string.Join(" ", arguments.ToArray());
        }

        [STAThread]
        static int Main(string[] args)
        {
            try
            {
                if (args.Length == 1 && args[0] == "--refresh-proxy")
                {
                    RefreshInternetSettings();
                    return 0;
                }
                if (args.Length == 1 && args[0] == "--flush-dns")
                {
                    FlushDnsCache();
                    return 0;
                }
                if (args.Length == 2 && args[0] == "--check-install") return MatchesInstallation(args[1]) ? 0 : 1;
                if (args.Length != 2 || !MatchesInstallation(args[0])) return 1;
                string arguments = File.Exists(args[1]) ? ReadArguments(args[1]) : "";
                Thread.Sleep(120);
                Process.Start(new ProcessStartInfo {
                    FileName = args[0], Arguments = arguments,
                    WorkingDirectory = Path.GetDirectoryName(args[0]), UseShellExecute = false
                });
                return 0;
            }
            catch { return 1; }
        }
    }
}
