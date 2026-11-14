$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Display setup is restricted to the disposable CI runner' }

# The hosted Windows desktop starts at 1024x768. Native captures and mouse
# resizing need the entire 1280x860 test window to remain on the real desktop.
Set-DisplayResolution -Width 1920 -Height 1080 -Force
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class CiDisplay {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
  [DllImport("user32.dll", EntryPoint="SystemParametersInfoW", SetLastError=true)] public static extern bool ReadParameter(uint action, uint parameter, out bool value, uint flags);
  [DllImport("user32.dll", EntryPoint="SystemParametersInfoW", SetLastError=true)] public static extern bool WriteParameter(uint action, uint parameter, System.IntPtr value, uint flags);
}
'@
[CiDisplay]::SetProcessDPIAware() | Out-Null
$displayWidth = [CiDisplay]::GetSystemMetrics(0)
$displayHeight = [CiDisplay]::GetSystemMetrics(1)
if ($displayWidth -lt 1920 -or $displayHeight -lt 1080) {
  throw "CI desktop is too small for native window checks: ${displayWidth}x${displayHeight}"
}
$fullWindowDrag = $false
if (![CiDisplay]::ReadParameter(0x0026, 0, [ref]$fullWindowDrag, 0)) { throw 'Cannot read full-window dragging policy' }
Write-Output "Full-window dragging before setup: $fullWindowDrag"
if (![CiDisplay]::WriteParameter(0x0025, 1, [IntPtr]::Zero, 2)) { throw 'Cannot enable full-window dragging' }
if (![CiDisplay]::ReadParameter(0x0026, 0, [ref]$fullWindowDrag, 0) -or !$fullWindowDrag) { throw 'Full-window dragging remains disabled' }
Write-Output "CI desktop: ${displayWidth}x${displayHeight}; full-window dragging: $fullWindowDrag"
