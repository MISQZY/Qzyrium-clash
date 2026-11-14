param([long]$WindowHandle, [string]$OutputDirectory, [double]$ScaleFactor = 2)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NativeDrag {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct GUITHREADINFO {
    public uint cbSize, flags;
    public IntPtr active, focus, capture, menuOwner, moveSize, caret;
    public RECT caretRect;
  }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hwnd, ref POINT point);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT point);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint threadId, ref GUITHREADINFO info);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll", EntryPoint="SystemParametersInfoW", SetLastError=true)] public static extern bool ReadParameter(uint action, uint parameter, out bool value, uint flags);
  [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
  public static void MoveMouse(int x, int y) {
    int left = GetSystemMetrics(76), top = GetSystemMetrics(77);
    int width = GetSystemMetrics(78), height = GetSystemMetrics(79);
    uint normalizedX = (uint)Math.Max(0, Math.Min(65535, (long)(x - left) * 65535 / (width - 1)));
    uint normalizedY = (uint)Math.Max(0, Math.Min(65535, (long)(y - top) * 65535 / (height - 1)));
    // Inject a mouse-move input event. Cursor warping alone need not deliver
    // the input consumed by Windows' modal sizing loop on a virtual desktop.
    mouse_event(0xC001, normalizedX, normalizedY, 0, UIntPtr.Zero);
  }
  public static bool IsSizing(IntPtr hwnd) {
    uint pid;
    uint thread = GetWindowThreadProcessId(hwnd, out pid);
    var info = new GUITHREADINFO { cbSize = (uint)Marshal.SizeOf(typeof(GUITHREADINFO)) };
    if (!GetGUIThreadInfo(thread, ref info)) throw new InvalidOperationException("Cannot inspect native sizing state");
    return (info.flags & 2) != 0 && info.moveSize == hwnd;
  }
  public static void BeginSizing(IntPtr hwnd, int x, int y) {
    long coordinates = ((long)(ushort)y << 16) + (ushort)x;
    if (!PostMessage(hwnd, 0x00A1, new IntPtr(17), new IntPtr(coordinates)))
      throw new InvalidOperationException("Cannot start native border sizing");
  }
  public static POINT ResizePoint(IntPtr hwnd) {
    RECT rect;
    if (!GetWindowRect(hwnd, out rect)) throw new InvalidOperationException("Cannot read resize bounds");
    // The outer rectangle includes invisible DWM margins. Query the actual
    // non-client corner instead of assuming right-2/bottom-2 is a resize grip.
    for (int inset = 1; inset <= 32; inset++) {
      int x = rect.Right - inset, y = rect.Bottom - inset;
      IntPtr hit;
      long coordinates = ((long)(ushort)y << 16) + (ushort)x;
      if (SendMessageTimeout(hwnd, 0x0084, IntPtr.Zero, new IntPtr(coordinates), 2, 1000, out hit) == IntPtr.Zero)
        throw new InvalidOperationException("Resize hit-test timed out");
      var point = new POINT { X = x, Y = y };
      if (hit.ToInt64() == 17 && WindowFromPoint(point) == hwnd) return point; // HTBOTTOMRIGHT
    }
    throw new InvalidOperationException("No native bottom-right resize grip found");
  }
}
'@
[NativeDrag]::SetProcessDPIAware() | Out-Null
$fullWindowDrag = $false
if (![NativeDrag]::ReadParameter(0x0026, 0, [ref]$fullWindowDrag, 0) -or !$fullWindowDrag) {
  throw 'Native pixel checks require full-window dragging; run the CI desktop setup first'
}
$handle = [IntPtr]$WindowHandle
[NativeDrag]::SetForegroundWindow($handle) | Out-Null
$rect = New-Object NativeDrag+RECT
$cursor = New-Object NativeDrag+POINT
[NativeDrag]::GetWindowRect($handle, [ref]$rect) | Out-Null
[NativeDrag]::GetCursorPos([ref]$cursor) | Out-Null
$resizePoint = [NativeDrag]::ResizePoint($handle)
$startX = $resizePoint.X
$startY = $resizePoint.Y
[NativeDrag]::MoveMouse($startX, $startY)
Start-Sleep -Milliseconds 150
[NativeDrag]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
$samples = @()
try {
  Start-Sleep -Milliseconds 100
  if (![NativeDrag]::IsSizing($handle)) {
    # Some virtual desktops update button state without forwarding the
    # non-client button message. Enter the same OS sizing loop explicitly.
    [NativeDrag]::BeginSizing($handle, $startX, $startY)
    Start-Sleep -Milliseconds 100
  }
  if (![NativeDrag]::IsSizing($handle)) { throw 'Window did not enter the native sizing loop' }
  for ($step = 0; $step -lt 120; $step++) {
    $phase = $step % 60
    $offset = if ($phase -lt 30) { $phase * 8 } else { (60 - $phase) * 8 }
    [NativeDrag]::MoveMouse($startX + $offset, $startY + [int]($offset / 2))
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
      $pointer = New-Object NativeDrag+POINT
      [NativeDrag]::GetCursorPos([ref]$pointer) | Out-Null
      $samples += @{ step = $step; width = $client.Right; height = $client.Bottom; colors = $colors; timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); originX = $origin.X; originY = $origin.Y; startX = $startX; startY = $startY; cursorX = $pointer.X; cursorY = $pointer.Y; foreground = ([NativeDrag]::GetForegroundWindow() -eq $handle); buttonDown = ([NativeDrag]::GetAsyncKeyState(1) -lt 0) }
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
  }
} finally {
  [NativeDrag]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  for ($cleanupAttempt = 0; $cleanupAttempt -lt 20 -and [NativeDrag]::IsSizing($handle); $cleanupAttempt++) { Start-Sleep -Milliseconds 25 }
  if ([NativeDrag]::IsSizing($handle)) { [NativeDrag]::PostMessage($handle, 0x001F, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null }
  [NativeDrag]::SetCursorPos($cursor.X, $cursor.Y) | Out-Null
}
ConvertTo-Json -InputObject $samples -Depth 5 -Compress
