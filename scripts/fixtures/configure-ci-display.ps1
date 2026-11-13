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
}
'@
[CiDisplay]::SetProcessDPIAware() | Out-Null
$displayWidth = [CiDisplay]::GetSystemMetrics(0)
$displayHeight = [CiDisplay]::GetSystemMetrics(1)
if ($displayWidth -lt 1920 -or $displayHeight -lt 1080) {
  throw "CI desktop is too small for native window checks: ${displayWidth}x${displayHeight}"
}
Write-Output "CI desktop: ${displayWidth}x${displayHeight}; test compositor: SwANGLE"
