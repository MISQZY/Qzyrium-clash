param([long]$WindowHandle, [string]$OutputDirectory, [double]$ScaleFactor = 2)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NativeDrag {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hwnd, ref POINT point);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
}
'@
[NativeDrag]::SetProcessDPIAware() | Out-Null
$handle = [IntPtr]$WindowHandle
[NativeDrag]::SetForegroundWindow($handle) | Out-Null
$rect = New-Object NativeDrag+RECT
$cursor = New-Object NativeDrag+POINT
[NativeDrag]::GetWindowRect($handle, [ref]$rect) | Out-Null
[NativeDrag]::GetCursorPos([ref]$cursor) | Out-Null
$startX = $rect.Right - 2
$startY = $rect.Bottom - 2
[NativeDrag]::SetCursorPos($startX, $startY) | Out-Null
Start-Sleep -Milliseconds 150
[NativeDrag]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
$samples = @()
try {
  for ($step = 0; $step -lt 120; $step++) {
    $phase = $step % 60
    $offset = if ($phase -lt 30) { $phase * 8 } else { (60 - $phase) * 8 }
    [NativeDrag]::SetCursorPos($startX + $offset, $startY + [int]($offset / 2)) | Out-Null
    Start-Sleep -Milliseconds 16
    if ($step % 15 -ne 0) { continue }
    # Pause while still holding the resize border, never using Electron's
    # capturePage(), which can itself trigger a renderer repaint.
    Start-Sleep -Milliseconds 100
    $client = New-Object NativeDrag+RECT
    $origin = New-Object NativeDrag+POINT
    [NativeDrag]::GetClientRect($handle, [ref]$client) | Out-Null
    [NativeDrag]::ClientToScreen($handle, [ref]$origin) | Out-Null
    $bitmap = New-Object System.Drawing.Bitmap($client.Right, $client.Bottom)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.CopyFromScreen($origin.X, $origin.Y, 0, 0, $bitmap.Size)
      $bitmap.Save((Join-Path $OutputDirectory "drag-$step.png"), [System.Drawing.Imaging.ImageFormat]::Png)
      $inset = [int](20 * $ScaleFactor)
      $top = [int](72 * $ScaleFactor)
      $points = @(@($inset, $top), @(($client.Right - $inset), $top), @($inset, ($client.Bottom - $inset)), @(($client.Right - $inset), ($client.Bottom - $inset)))
      $colors = @($points | ForEach-Object { $color = $bitmap.GetPixel($_[0], $_[1]); @($color.B, $color.G, $color.R) })
      $samples += @{ step = $step; width = $client.Right; height = $client.Bottom; colors = $colors; timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); originX = $origin.X; originY = $origin.Y }
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
  }
} finally {
  [NativeDrag]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  [NativeDrag]::SetCursorPos($cursor.X, $cursor.Y) | Out-Null
}
ConvertTo-Json -InputObject $samples -Depth 5 -Compress
