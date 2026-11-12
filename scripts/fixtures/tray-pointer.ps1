param([string]$Tooltip, [ValidateSet('left', 'right', 'escape')][string]$Action = 'right')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class TrayPointer {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
}
'@
if ($Action -eq 'escape') {
  [TrayPointer]::keybd_event(27, 0, 0, [UIntPtr]::Zero)
  [TrayPointer]::keybd_event(27, 0, 2, [UIntPtr]::Zero)
  exit
}
$rootElement = [System.Windows.Automation.AutomationElement]::RootElement
function Find-TrayIcon {
  foreach ($window in $rootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
    if ($window.Current.ClassName -notin @('Shell_TrayWnd', 'TopLevelWindowForOverflowXamlIsland', 'NotifyIconOverflowWindow')) { continue }
    if (![TrayPointer]::IsWindowVisible([IntPtr]$window.Current.NativeWindowHandle)) { continue }
    foreach ($element in $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
      if ($element.Current.AutomationId -eq 'NotifyItemIcon' -and $element.Current.Name.Trim().StartsWith($Tooltip) -and !$element.Current.IsOffscreen) { return $element }
    }
  }
}
$icon = Find-TrayIcon
if (!$icon) {
  $taskbar = $rootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, 'Shell_TrayWnd')))
  $overflow = $taskbar.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition) | Where-Object { $_.Current.Name -match 'hidden icons|\u0441\u043a\u0440\u044b\u0442\u044b\u0435' } | Select-Object -First 1
  if (!$overflow) { throw 'Cannot find notification overflow button' }
  $openPanel = $rootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, 'TopLevelWindowForOverflowXamlIsland')))
  if (!$openPanel -or ![TrayPointer]::IsWindowVisible([IntPtr]$openPanel.Current.NativeWindowHandle)) {
    $overflow.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  }
  Start-Sleep -Milliseconds 500
  $icon = Find-TrayIcon
}
if (!$icon) { throw "Cannot find tray icon: $Tooltip" }
$bounds = $icon.Current.BoundingRectangle
Write-Output "$Action $($icon.Current.Name) at $bounds"
$original = New-Object TrayPointer+POINT
[TrayPointer]::GetCursorPos([ref]$original) | Out-Null
try {
  [TrayPointer]::SetCursorPos([int]($bounds.X + $bounds.Width / 2), [int]($bounds.Y + $bounds.Height / 2)) | Out-Null
  $down = if ($Action -eq 'right') { 8 } else { 2 }
  $up = if ($Action -eq 'right') { 16 } else { 4 }
  [TrayPointer]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
  [TrayPointer]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 350
} finally {
  [TrayPointer]::SetCursorPos($original.X, $original.Y) | Out-Null
}
