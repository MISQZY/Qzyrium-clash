using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text.RegularExpressions;
using System.Threading;

namespace QzyriumRunner
{
    static class Program
    {
        static bool Trusted(IdentityReference identity)
        {
            string sid = identity.Translate(typeof(SecurityIdentifier)).Value;
            return sid == "S-1-5-18" || sid == "S-1-5-32-544" ||
                sid == "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464";
        }

        static bool Protected(FileSystemInfo entry, bool ancestor)
        {
            if ((entry.Attributes & FileAttributes.ReparsePoint) != 0) return false;
            FileSystemSecurity acl = entry is DirectoryInfo
                ? (FileSystemSecurity)((DirectoryInfo)entry).GetAccessControl()
                : ((FileInfo)entry).GetAccessControl();
            if (!Trusted(acl.GetOwner(typeof(SecurityIdentifier)))) return false;
            FileSystemRights dangerous = FileSystemRights.Delete | FileSystemRights.DeleteSubdirectoriesAndFiles |
                FileSystemRights.ChangePermissions | FileSystemRights.TakeOwnership;
            if (!ancestor) dangerous |= FileSystemRights.Write;
            foreach (FileSystemAccessRule rule in acl.GetAccessRules(true, true, typeof(SecurityIdentifier)))
            {
                if (rule.AccessControlType != AccessControlType.Allow ||
                    (rule.PropagationFlags & PropagationFlags.InheritOnly) != 0) continue;
                if ((rule.FileSystemRights & dangerous) != 0 && !Trusted(rule.IdentityReference)) return false;
            }
            return true;
        }

        static bool ProtectedTree(DirectoryInfo directory)
        {
            if (!Protected(directory, false)) return false;
            foreach (FileSystemInfo entry in directory.GetFileSystemInfos())
            {
                DirectoryInfo child = entry as DirectoryInfo;
                if (child != null ? !ProtectedTree(child) : !Protected(entry, false)) return false;
            }
            return true;
        }

        static bool SafeInstallation(string target)
        {
            string root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", ".."));
            if (!string.Equals(Path.GetFullPath(target), Path.Combine(root, "Qzyrium-clash.exe"), StringComparison.OrdinalIgnoreCase) ||
                !File.Exists(target)) return false;
            DirectoryInfo directory = new DirectoryInfo(root);
            if (!ProtectedTree(directory)) return false;
            for (directory = directory.Parent; directory != null; directory = directory.Parent)
                if (!Protected(directory, true)) return false;
            return true;
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
                if (args.Length == 2 && args[0] == "--check-install") return SafeInstallation(args[1]) ? 0 : 1;
                if (args.Length != 2 || !SafeInstallation(args[0])) return 1;
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
