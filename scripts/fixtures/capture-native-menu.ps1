param([int]$TargetProcess, [string]$OutputPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName System.Drawing
$rootElement = [System.Windows.Automation.AutomationElement]::RootElement
$menus = @()
foreach ($window in $rootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
  if ($window.Current.ProcessId -ne $TargetProcess) { continue }
  if ($window.Current.ControlType -eq [System.Windows.Automation.ControlType]::Menu) { $menus += $window }
  $menus += @($window.FindAll([System.Windows.Automation.TreeScope]::Descendants,
    (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Menu))))
}
$menu = $menus | Where-Object { !$_.Current.IsOffscreen -and $_.Current.BoundingRectangle.Width -gt 100 } | Select-Object -First 1
if (!$menu) { throw 'No visible native context menu' }
$bounds = $menu.Current.BoundingRectangle
$bitmap = New-Object System.Drawing.Bitmap([int]$bounds.Width, [int]$bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.CopyFromScreen([int]$bounds.X, [int]$bounds.Y, 0, 0, $bitmap.Size)
  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $colors = New-Object 'System.Collections.Generic.HashSet[int]'
  for ($y = 4; $y -lt $bitmap.Height - 4; $y += 3) {
    for ($x = 4; $x -lt $bitmap.Width - 4; $x += 3) { $colors.Add($bitmap.GetPixel($x, $y).ToArgb()) | Out-Null }
  }
  $labels = @($menu.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition) | ForEach-Object { if ($_.Current.Name) { $_.Current.Name } })
  @{ colors = $colors.Count; labels = $labels; width = $bitmap.Width; height = $bitmap.Height } | ConvertTo-Json -Compress
} finally { $graphics.Dispose(); $bitmap.Dispose() }
