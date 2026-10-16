$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$env:Path = "$project\.tools\node-v24.21.0-win-x64;$project\.tools\runner\node_modules\.bin;$project\.tools\pgsql\bin;$env:Path"
Set-Location $project
Write-Host 'LaroSentry local tools available in this shell. Run pnpm setup:check.'
