$ErrorActionPreference = 'Stop'
$demoRoot = Split-Path -Parent $PSScriptRoot
$demoSecrets = @{}
foreach ($demoRole in @('PLAYER', 'FACILITY_OWNER', 'FACILITY_STAFF', 'ADMIN')) {
    $demoSecure = Read-Host "Set local demo password for $demoRole (12-128 characters)" -AsSecureString
    $demoPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($demoSecure)
    try { $demoValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($demoPointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($demoPointer) }
    if ($demoValue.Length -lt 12 -or $demoValue.Length -gt 128) { throw 'Password must contain 12-128 characters.' }
    $demoSecrets[$demoRole] = $demoValue
}
$demoDestination = Join-Path $demoRoot '.local/demo-passwords.json'
[IO.File]::WriteAllText($demoDestination, ($demoSecrets | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
$demoIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$null = & icacls.exe $demoDestination /inheritance:r /grant:r "${demoIdentity}:(F)"
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict password file access to the current Windows account.' }
$demoSecrets.Clear()
$demoValue = $null
Write-Host 'Local passwords saved in ignored .local/demo-passwords.json. Run demo:setup to create a fresh isolated demo with these passwords.'
