using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;

namespace QzyriumRunner
{
    static class Program
    {
        [DllImport("wininet.dll", SetLastError = true)]
        static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);

        const int INTERNET_OPTION_REFRESH = 37;
        const int INTERNET_OPTION_SETTINGS_CHANGED = 39;

        static void RefreshInternetSettings()
        {
            InternetSetOption(IntPtr.Zero, INTERNET_OPTION_SETTINGS_CHANGED, IntPtr.Zero, 0);
            InternetSetOption(IntPtr.Zero, INTERNET_OPTION_REFRESH, IntPtr.Zero, 0);
        }
        // UAC consent registers this installation, including custom/portable paths.
        // Restrict the launcher to its sibling application, without requiring
        // administrator-owned directories or ACLs on the installation's parents.
        static bool MatchesInstallation(string target)
        {
            string root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", ".."));
            return string.Equals(Path.GetFullPath(target), Path.Combine(root, "Qzyrium-clash.exe"), StringComparison.OrdinalIgnoreCase) &&
                File.Exists(target);
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
