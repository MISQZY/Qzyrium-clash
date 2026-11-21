import { app } from 'electron'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

// This verifier runs in the OS PowerShell, before executing any bundled helper.
// Never bootstrap a trust decision by invoking the executable being checked.
export const WINDOWS_EXECUTABLE_POLICY = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$trustedOwners = @('S-1-5-18', 'S-1-5-32-544', 'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')
function Test-AclPolicy($acl, [bool]$ancestor) {
  if ($trustedOwners -notcontains $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value) { throw 'Untrusted executable owner' }
  $descriptor = New-Object System.Security.AccessControl.RawSecurityDescriptor($acl.GetSecurityDescriptorSddlForm('All'))
  if ($null -eq $descriptor.DiscretionaryAcl) { throw 'Unrestricted executable ACL' }
  # Ancestors may permit creating unrelated children (e.g. ProgramData), but
  # must not permit deleting/replacing this protected subtree or changing ACLs.
  $mask = if ($ancestor) { 0x100D0040 } else { 0x500D0156 }
  foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -ne 'Allow' -or (($rule.PropagationFlags -band 2) -ne 0)) { continue }
    if (($trustedOwners -notcontains $rule.IdentityReference.Value) -and (([int]$rule.FileSystemRights -band $mask) -ne 0)) { throw 'Executable location is writable without elevation' }
  }
}
function Assert-Location([string]$filename, [string]$boundary = $filename) {
  $item = Get-Item -LiteralPath $filename -Force
  $ancestor = [string]::IsNullOrEmpty($boundary)
  while ($null -ne $item) {
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Executable location contains a reparse point' }
    Test-AclPolicy (Get-Acl -LiteralPath $item.FullName) $ancestor
    if ($item.FullName.TrimEnd('\') -eq $boundary.TrimEnd('\')) { $ancestor = $true }
    $item = if ($item -is [IO.DirectoryInfo]) { $item.Parent } else { $item.Directory }
  }
}
function Get-CoreStore([bool]$create) {
  $base = [Environment]::GetFolderPath([Environment+SpecialFolder]::CommonApplicationData)
  Assert-Location $base ''
  $root = $base
  foreach ($component in @('Qzyrium-clash', 'cores', $request.arch)) {
    $root = [IO.Path]::Combine($root, $component)
    if (-not [IO.Directory]::Exists($root)) {
      if (-not $create) { continue }
      $acl = New-Object System.Security.AccessControl.DirectorySecurity
      $acl.SetAccessRuleProtection($true, $false)
      $owner = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')
      $acl.SetOwner($owner)
      foreach ($sid in @('S-1-5-18', 'S-1-5-32-544', 'S-1-5-32-545')) {
        $identity = New-Object System.Security.Principal.SecurityIdentifier($sid)
        $rights = if ($sid -eq 'S-1-5-32-545') { 'ReadAndExecute' } else { 'FullControl' }
        $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, $rights, 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
      }
      [IO.Directory]::CreateDirectory($root, $acl) | Out-Null
    }
    if ([IO.Directory]::Exists($root)) { Assert-Location $root }
  }
  return $root
}
if ($request.mode -eq 'elevation') {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator).ToString().ToLowerInvariant()
} elseif ($request.mode -eq 'store') {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if ($request.create -and -not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Core installation requires elevation' }
  Get-CoreStore ([bool]$request.create)
} else {
  $filename = [IO.Path]::GetFullPath($request.filename)
  $installation = [IO.Path]::GetFullPath($request.installation).TrimEnd('\')
  $store = Get-CoreStore $false
  $inInstall = $filename.StartsWith($installation + '\', [StringComparison]::OrdinalIgnoreCase)
  $inStore = $filename.StartsWith($store + '\', [StringComparison]::OrdinalIgnoreCase)
  if (-not $inInstall -and -not $inStore) { throw 'Executable is outside protected runtime locations' }
  $boundary = if ($inInstall) { $installation } else { $store }
  Assert-Location $filename $boundary
  if ($inInstall) {
    Assert-Location $installation
    Assert-Location ([IO.Path]::Combine($installation, 'resources', 'app.asar')) $installation
  }
}
`

/** The OS loader's KnownDLL path cannot be redirected through SystemRoot/PATH. */
export function trustedSystemBinary(name: string): string {
  const report = process.report?.getReport() as { sharedObjects?: string[] } | undefined
  const ntdll = report?.sharedObjects?.find(filename => path.win32.basename(filename).toLowerCase() === 'ntdll.dll')
  if (!ntdll || !path.win32.isAbsolute(ntdll)) throw new Error('Cannot determine the trusted Windows system directory')
  return path.win32.join(path.win32.dirname(ntdll), name)
}

function policy(request: object): string {
  const payload = Buffer.from(JSON.stringify({ arch: `win32-${process.arch}`, ...request }), 'utf8').toString('base64')
  const script = `$request = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json\n${WINDOWS_EXECUTABLE_POLICY}`
  try {
    return execFileSync(trustedSystemBinary('WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { encoding: 'utf8', windowsHide: true, timeout: 15_000, maxBuffer: 64 * 1024 }).trim()
  } catch {
    throw new Error('Unsafe executable location. Install Qzyrium-clash in a directory protected from changes by standard users, and download the core again.')
  }
}

export function usesProtectedCoreStore(): boolean {
  return process.platform === 'win32' && app?.isPackaged === true
}

let coreStore: string | undefined
export function getProtectedCoreStore(): string {
  coreStore ??= policy({ mode: 'store', create: false })
  return coreStore
}

export function ensureProtectedCoreStore(): void {
  if (!usesProtectedCoreStore()) return
  if (!canManageProtectedCoreStore()) throw new Error('Restart Qzyrium-clash as administrator to install or update a core in protected storage.')
  policy({ mode: 'store', create: true })
}

let elevated: boolean | undefined
function needsExecutionGuard(): boolean {
  if (!usesProtectedCoreStore()) return false
  if (elevated === undefined) {
    const result = policy({ mode: 'elevation' })
    if (result !== 'true' && result !== 'false') throw new Error('Cannot verify the Windows elevation token')
    elevated = result === 'true'
  }
  return elevated
}

export function canManageProtectedCoreStore(): boolean {
  return !usesProtectedCoreStore() || needsExecutionGuard()
}

export function assertTrustedExecutable(filename: string, always = false): void {
  if (!usesProtectedCoreStore() || (!always && !needsExecutionGuard())) return
  policy({ mode: 'verify', filename, installation: path.dirname(process.execPath) })
}

/** Scheduled elevation must never register or launch a user-writable install. */
export function assertTrustedInstallation(): void {
  assertTrustedExecutable(process.execPath, true)
}
