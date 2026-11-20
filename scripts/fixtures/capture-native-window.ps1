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
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
  [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr desktop);
}
'@
[NativeCapture]::SetProcessDPIAware() | Out-Null
$handle = [IntPtr]$WindowHandle
if (![NativeCapture]::IsWindowVisible($handle)) { throw 'Window is hidden' }

$inputDesktop = [NativeCapture]::OpenInputDesktop(0, $false, 0x0100)
if ($inputDesktop -eq [IntPtr]::Zero) {
  @{ skipped = $true; reason = 'Windows desktop session is locked or non-interactive'; colors = 0 } | ConvertTo-Json -Compress
  exit 0
}
[NativeCapture]::CloseDesktop($inputDesktop) | Out-Null
[NativeCapture]::BringWindowToTop($handle) | Out-Null
[NativeCapture]::SetForegroundWindow($handle) | Out-Null
Start-Sleep -Milliseconds 350
$fore = [NativeCapture]::GetForegroundWindow()
if ($fore -ne $handle -and $fore -ne [IntPtr]::Zero) {
  $targetPid = [uint32]0
  $targetThread = [NativeCapture]::GetWindowThreadProcessId($handle, [ref]$targetPid)
  $forePid = [uint32]0
  $foreThread = [NativeCapture]::GetWindowThreadProcessId($fore, [ref]$forePid)
  $currentProcess = [System.Diagnostics.Process]::GetCurrentProcess()
  $currentPid = [uint32]$currentProcess.Id
  $currentThread = [NativeCapture]::GetWindowThreadProcessId([System.Diagnostics.Process]::GetCurrentProcess().MainWindowHandle, [ref]$currentPid)
  if ($targetThread -ne 0 -and $foreThread -ne 0) {
    [NativeCapture]::AttachThreadInput($currentThread, $targetThread, $true) | Out-Null
    [NativeCapture]::AttachThreadInput($foreThread, $targetThread, $true) | Out-Null
    [NativeCapture]::BringWindowToTop($handle) | Out-Null
    [NativeCapture]::SetForegroundWindow($handle) | Out-Null
    [NativeCapture]::AttachThreadInput($foreThread, $targetThread, $false) | Out-Null
    [NativeCapture]::AttachThreadInput($currentThread, $targetThread, $false) | Out-Null
    Start-Sleep -Milliseconds 350
  }
}
$currentFore = [NativeCapture]::GetForegroundWindow()
if ($currentFore -ne $handle -and $currentFore -ne [IntPtr]::Zero) {
  throw "Cannot verify native pixels: window is not foreground (handle: $handle, fore: $currentFore, initial: $fore)"
}
$rect = New-Object NativeCapture+RECT
if (![NativeCapture]::GetClientRect($handle, [ref]$rect)) { throw 'Cannot read native client bounds' }
$origin = New-Object NativeCapture+POINT
if (![NativeCapture]::ClientToScreen($handle, [ref]$origin)) { throw 'Cannot read native client position' }
$desktopLeft = [NativeCapture]::GetSystemMetrics(76)
$desktopTop = [NativeCapture]::GetSystemMetrics(77)
$desktopWidth = [NativeCapture]::GetSystemMetrics(78)
$desktopHeight = [NativeCapture]::GetSystemMetrics(79)
if ($origin.X -lt $desktopLeft -or $origin.Y -lt $desktopTop -or
    $origin.X + $rect.Right -gt $desktopLeft + $desktopWidth -or
    $origin.Y + $rect.Bottom -gt $desktopTop + $desktopHeight) {
  throw "Cannot verify native pixels: client lies outside the ${desktopWidth}x${desktopHeight} desktop"
}
$bitmap = New-Object System.Drawing.Bitmap(($rect.Right - $rect.Left), ($rect.Bottom - $rect.Top))
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  try {
    $graphics.CopyFromScreen($origin.X, $origin.Y, 0, 0, $bitmap.Size)
  } catch [System.ComponentModel.Win32Exception] {
    @{ skipped = $true; reason = 'Windows desktop display device context is unavailable (desktop locked or disconnected)'; colors = 0 } | ConvertTo-Json -Compress
    exit 0
  }
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
