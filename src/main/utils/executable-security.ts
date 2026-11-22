import { app } from 'electron'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

export type ExecutableRole = 'core' | 'runner' | 'watchdog'
declare const __QZYRIUM_EXECUTABLE_PINS__: Partial<Record<ExecutableRole, string>>

// Verify snapshots through the OS before trusting bundled helpers. Sources may
// be portable/writable; only verified, protected copies execute with elevation.
export const WINDOWS_EXECUTABLE_POLICY = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$PSModuleAutoloadingPreference = 'None'
$env:PSModulePath = [IO.Path]::Combine($PSHOME, 'Modules')
if (-not (Get-Command New-Object -ErrorAction SilentlyContinue)) {
  Import-Module ([IO.Path]::Combine($PSHOME, 'Modules', 'Microsoft.PowerShell.Utility'))
}
if (-not (Get-Command Get-ChildItem -ErrorAction SilentlyContinue)) {
  Import-Module ([IO.Path]::Combine($PSHOME, 'Modules', 'Microsoft.PowerShell.Management'))
}
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$trustedOwners = @('S-1-5-18', 'S-1-5-32-544', 'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')
function Get-ItemObject([string]$path) {
  if ([IO.Directory]::Exists($path)) { return New-Object IO.DirectoryInfo($path) }
  if ([IO.File]::Exists($path)) { return New-Object IO.FileInfo($path) }
  throw 'Target does not exist'
}
function Test-AclPolicy($acl, [bool]$ancestor) {
  if ($trustedOwners -notcontains $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value) { throw 'Untrusted executable owner' }
  $descriptor = New-Object System.Security.AccessControl.RawSecurityDescriptor($acl.GetSecurityDescriptorSddlForm('All'))
  if ($null -eq $descriptor.DiscretionaryAcl) { throw 'Unrestricted executable ACL' }
  $mask = if ($ancestor) { 0x100D0040 } else { 0x500D0156 }
  foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -ne 'Allow' -or (($rule.PropagationFlags -band 2) -ne 0)) { continue }
    if (($trustedOwners -notcontains $rule.IdentityReference.Value) -and (([int]$rule.FileSystemRights -band $mask) -ne 0)) { throw 'Executable location is writable without elevation' }
  }
}
function Assert-Location([string]$filename, [string]$boundary = $filename) {
  $item = Get-ItemObject $filename
  $ancestor = [string]::IsNullOrEmpty($boundary)
  while ($null -ne $item) {
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Executable location contains a reparse point' }
    $acl = if ($item -is [IO.DirectoryInfo]) { [IO.Directory]::GetAccessControl($item.FullName) } else { [IO.File]::GetAccessControl($item.FullName) }
    Test-AclPolicy $acl $ancestor
    if ($item.FullName.TrimEnd('\') -eq $boundary.TrimEnd('\')) { $ancestor = $true }
    $item = if ($item -is [IO.DirectoryInfo]) { $item.Parent } else { $item.Directory }
  }
}
function New-ProtectedDirectory([string]$directory) {
  if (-not [IO.Directory]::Exists($directory)) {
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $acl.SetOwner((New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')))
    foreach ($sid in @('S-1-5-18', 'S-1-5-32-544', 'S-1-5-32-545')) {
      $identity = New-Object System.Security.Principal.SecurityIdentifier($sid)
      $rights = if ($sid -eq 'S-1-5-32-545') { 'ReadAndExecute' } else { 'FullControl' }
      $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, $rights, 'ContainerInherit,ObjectInherit', 'None', 'Allow')
      $acl.AddAccessRule($rule)
    }
    [IO.Directory]::CreateDirectory($directory, $acl) | Out-Null
  }
  Assert-Location $directory
}
function Get-RuntimeDirectory([bool]$create) {
  $root = [Environment]::GetFolderPath([Environment+SpecialFolder]::CommonApplicationData)
  Assert-Location $root ''
  if ($request.arch -notmatch '^win32-(x64|ia32|arm64)$') { throw 'Unsupported runtime architecture' }
  foreach ($component in @('Qzyrium-clash', 'runtime', $request.arch)) {
    $root = [IO.Path]::Combine($root, $component)
    if ($create) { New-ProtectedDirectory $root }
    elseif ([IO.Directory]::Exists($root)) { Assert-Location $root }
  }
  return $root
}
function Get-StreamHash($stream) {
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $algorithm.Dispose() }
}
function Assert-CachedExecutable([string]$filename, [string]$digest, [string]$root) {
  Assert-Location $filename $root
  $stream = [IO.File]::Open($filename, 'Open', 'Read', 'Read')
  try { if ((Get-StreamHash $stream) -ne $digest) { throw 'Protected executable hash mismatch' } }
  finally { $stream.Dispose() }
}
function Set-ProtectedFileOwner([string]$filename) {
  $acl = [IO.File]::GetAccessControl($filename)
  $acl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))
  [IO.File]::SetAccessControl($filename, $acl)
}
function Stage-Executable {
  if ($request.digest -notmatch '^[a-f0-9]{64}$') { throw 'Invalid executable digest' }
  $name = switch ($request.role) { 'core' { 'mihomo.exe' }; 'runner' { 'qzyrium-run.exe' }; 'watchdog' { 'qzyrium-watchdog.exe' }; default { throw 'Invalid executable role' } }
  # FileShare.Read excludes writers/deleters throughout the hash/copy transaction.
  $source = [IO.File]::Open([IO.Path]::GetFullPath($request.filename), 'Open', 'Read', 'Read')
  $temporary = $null
  try {
    if ((Get-StreamHash $source) -ne $request.digest) { throw 'Executable changed before staging' }
    $root = Get-RuntimeDirectory $false
    $directory = [IO.Path]::Combine($root, $request.digest)
    $target = [IO.Path]::Combine($directory, $name)
    if ([IO.File]::Exists($target)) {
      Assert-CachedExecutable $target $request.digest $root
      return $target
    }
    if (-not $request.approved) {
      # Protected sources are trusted regardless of location. Writable sources
      # require a build pin or an independently authenticated official release.
      Assert-Location $request.filename ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($request.filename)))
    }
    $root = Get-RuntimeDirectory $true
    New-ProtectedDirectory $directory
    $temporary = [IO.Path]::Combine($directory, '.stage-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    $output = [IO.File]::Open($temporary, 'CreateNew', 'Write', 'None')
    try { $source.Position = 0; $source.CopyTo($output); $output.Flush($true) }
    finally { $output.Dispose() }
    Set-ProtectedFileOwner $temporary
    Assert-CachedExecutable $temporary $request.digest $root
    try { [IO.File]::Move($temporary, $target); $temporary = $null }
    catch { if (-not [IO.File]::Exists($target)) { throw } }
    Assert-CachedExecutable $target $request.digest $root
    return $target
  } finally {
    $source.Dispose()
    if ($null -ne $temporary -and [IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) }
  }
}
if ($request.mode -eq 'elevation') {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator).ToString().ToLowerInvariant()
} elseif ($request.mode -eq 'directory') {
  Get-RuntimeDirectory $false
} elseif ($request.mode -eq 'stage') {
  Stage-Executable
} elseif ($request.mode -eq 'installation') {
  $installation = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($request.filename))
  Assert-Location $request.filename $installation
  Assert-Location ([IO.Path]::Combine($installation, 'resources', 'app.asar')) $installation
} else {
  Assert-Location $request.filename ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($request.filename)))
}
`

/** Resolve the OS loader's KnownDLL, independently of SystemRoot/PATH. */
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
    const powershellBinary = trustedSystemBinary('WindowsPowerShell/v1.0/powershell.exe')
    const system32 = trustedSystemBinary('')
    const systemRoot = path.win32.dirname(system32)
    const systemModules = path.win32.join(system32, 'WindowsPowerShell', 'v1.0', 'Modules')
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      SystemRoot: systemRoot,
      SystemDrive: systemRoot.slice(0, 2),
      windir: systemRoot,
      PATH: system32,
      PSModulePath: systemModules
    }
    return execFileSync(powershellBinary,
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 64 * 1024, env }).trim()
  } catch {
    throw new Error('Executable verification failed. Update or download the official core again before running it as administrator.')
  }
}

function packagedWindows(): boolean { return process.platform === 'win32' && app?.isPackaged === true }
let elevated: boolean | undefined
function needsExecutionGuard(): boolean {
  if (!packagedWindows()) return false
  if (elevated === undefined) {
    const result = policy({ mode: 'elevation' })
    if (result !== 'true' && result !== 'false') throw new Error('Cannot verify the Windows elevation token')
    elevated = result === 'true'
  }
  return elevated
}

let runtimeDirectory: string | undefined
/** Read-only discovery; ordinary launches never create or require this cache. */
export function getProtectedRuntimeDirectory(): string {
  if (!needsExecutionGuard()) return ''
  runtimeDirectory ??= policy({ mode: 'directory' })
  return runtimeDirectory
}

const verifiedCoreDigests = new Set<string>()
/** Call only after independently authenticating the official release archive. */
export function registerVerifiedCore(bytes: Uint8Array): void {
  verifiedCoreDigests.add(createHash('sha256').update(bytes).digest('hex'))
}

export function getVerifiedCoreDigests(): string[] {
  return Array.from(verifiedCoreDigests)
}

export function registerVerifiedCoreDigest(digest: string): void {
  if (/^[a-f0-9]{64}$/i.test(digest)) {
    verifiedCoreDigests.add(digest.toLowerCase())
  }
}

export function prepareExecutableForExecution(source: string, role: ExecutableRole): string {
  if (!needsExecutionGuard()) return source
  if (!['core', 'runner', 'watchdog'].includes(role)) throw new Error('Invalid executable role')
  const digest = createHash('sha256').update(readFileSync(source)).digest('hex')
  const pins = typeof __QZYRIUM_EXECUTABLE_PINS__ === 'undefined' ? {} : __QZYRIUM_EXECUTABLE_PINS__
  const approved = pins[role] === digest || (role === 'core' && verifiedCoreDigests.has(digest))
  const target = policy({ mode: 'stage', filename: source, role, digest, approved })
  if (!path.win32.isAbsolute(target)) throw new Error('Invalid protected executable path')
  return target
}

/** ACL checks remain for persistent silent elevation, not manual UAC. */
export function assertTrustedExecutable(filename: string, always = false): void {
  if (!packagedWindows() || (!always && !needsExecutionGuard())) return
  policy({ mode: 'verify', filename })
}
export function assertTrustedInstallation(): void {
  if (packagedWindows()) policy({ mode: 'installation', filename: process.execPath })
}
