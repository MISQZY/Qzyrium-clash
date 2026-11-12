param([long]$WindowHandle, [string]$OutputPath, [double]$UiWidth = 0, [double]$UiHeight = 0)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NativeCapture {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hwnd, ref POINT point);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
}
'@
[NativeCapture]::SetProcessDPIAware() | Out-Null
$handle = [IntPtr]$WindowHandle
if (![NativeCapture]::IsWindowVisible($handle)) { throw 'Window is hidden' }
[NativeCapture]::SetForegroundWindow($handle) | Out-Null
Start-Sleep -Milliseconds 350
if ([NativeCapture]::GetForegroundWindow() -ne $handle) { throw 'Cannot verify native pixels: window is not foreground' }
$rect = New-Object NativeCapture+RECT
if (![NativeCapture]::GetClientRect($handle, [ref]$rect)) { throw 'Cannot read native client bounds' }
$origin = New-Object NativeCapture+POINT
if (![NativeCapture]::ClientToScreen($handle, [ref]$origin)) { throw 'Cannot read native client position' }
$bitmap = New-Object System.Drawing.Bitmap(($rect.Right - $rect.Left), ($rect.Bottom - $rect.Top))
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.CopyFromScreen($origin.X, $origin.Y, 0, 0, $bitmap.Size)
  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  # Ignore borders/shadows: the client area must contain actual UI variation.
  $colors = New-Object 'System.Collections.Generic.HashSet[int]'
  for ($y = 80; $y -lt $bitmap.Height - 30; $y += 11) {
    for ($x = 30; $x -lt $bitmap.Width - 30; $x += 11) {
      $colors.Add($bitmap.GetPixel($x, $y).ToArgb()) | Out-Null
    }
  }
  $probes = @()
  if ($UiWidth -gt 0 -and $UiHeight -gt 0) {
    $points = @(@(20, 72), @(($UiWidth - 20), 72), @(20, ($UiHeight - 20)), @(($UiWidth - 20), ($UiHeight - 20)))
    $probes = @($points | ForEach-Object {
      $pixel = $bitmap.GetPixel([int]($_[0] * $bitmap.Width / $UiWidth), [int]($_[1] * $bitmap.Height / $UiHeight))
      @($pixel.B, $pixel.G, $pixel.R)
    })
  }
  @{ colors = $colors.Count; width = $bitmap.Width; height = $bitmap.Height; probes = $probes } | ConvertTo-Json -Compress
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}
