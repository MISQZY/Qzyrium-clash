using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

namespace QzyriumRunner
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            if (args == null || args.Length < 1)
            {
                return;
            }

            try
            {
                string targetExe = args[0];
                if (string.IsNullOrEmpty(targetExe) || !File.Exists(targetExe))
                {
                    return;
                }

                string runnerDir = AppDomain.CurrentDomain.BaseDirectory;
                string paramFile = Path.Combine(runnerDir, "param.txt");

                string arguments = "";
                if (File.Exists(paramFile))
                {
                    try
                    {
                        arguments = File.ReadAllText(paramFile).Trim();
                        File.Delete(paramFile);
                    }
                    catch
                    {
                        // Ignore read or delete errors
                    }
                }

                if (arguments == "empty")
                {
                    arguments = "";
                }

                // Short delay to allow the calling unprivileged process to release locks and exit
                Thread.Sleep(120);

                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = targetExe;
                if (!string.IsNullOrEmpty(arguments))
                {
                    psi.Arguments = arguments;
                }
                psi.WorkingDirectory = Path.GetDirectoryName(targetExe);
                psi.UseShellExecute = true;

                Process.Start(psi);
            }
            catch
            {
                // Silently exit without showing any console or error windows
            }
        }
    }
}
