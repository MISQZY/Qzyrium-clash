param([long]$WindowHandle, [string]$ProcessIds, [int]$DurationMs = 60000)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
public static class ResizeStress {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  public sealed class Sample { public long elapsedMs; public long moves; public double privateMiB; public double workingSetMiB; public int width; public int height; }
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
  public static List<Sample> Run(IntPtr hwnd, int[] ids, int durationMs) {
    SetProcessDPIAware(); SetForegroundWindow(hwnd);
    RECT initial; POINT original; GetWindowRect(hwnd, out initial); GetCursorPos(out original);
    var watch = Stopwatch.StartNew(); var result = new List<Sample>(); long moves = 0, nextSample = 0;
    int startX = initial.Right - 2, startY = initial.Bottom - 2;
    SetCursorPos(startX, startY); Thread.Sleep(150); mouse_event(2, 0, 0, 0, UIntPtr.Zero);
    try {
      while (watch.ElapsedMilliseconds < durationMs) {
        // Independent frequencies cover many different width/height pairs,
        // rather than repeatedly warming a fixed set of cached surface sizes.
        int offsetX = (int)(180 * (1 - Math.Cos(moves * 0.11)));
        int offsetY = (int)(90 * (1 - Math.Cos(moves * 0.073)));
        SetCursorPos(startX + offsetX, startY + offsetY); Thread.Sleep(2); moves++;
        if (watch.ElapsedMilliseconds < nextSample) continue;
        RECT rect; GetWindowRect(hwnd, out rect);
        var row = new Sample { elapsedMs = watch.ElapsedMilliseconds, moves = moves, width = rect.Right - rect.Left, height = rect.Bottom - rect.Top };
        foreach (int id in ids) { using (var process = Process.GetProcessById(id)) { process.Refresh(); row.privateMiB += process.PrivateMemorySize64 / 1048576.0; row.workingSetMiB += process.WorkingSet64 / 1048576.0; } }
        result.Add(row); nextSample = watch.ElapsedMilliseconds + 500;
        if (row.privateMiB > 1200) break; // Stop the isolated test before exhausting system memory.
      }
    } finally { mouse_event(4, 0, 0, 0, UIntPtr.Zero); SetCursorPos(original.X, original.Y); }
    return result;
  }
}
'@
$ids = @($ProcessIds.Split(',') | ForEach-Object { [int]$_ })
ConvertTo-Json -InputObject @([ResizeStress]::Run([IntPtr]$WindowHandle, $ids, $DurationMs)) -Depth 4 -Compress
