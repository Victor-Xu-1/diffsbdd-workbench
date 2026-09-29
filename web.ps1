param([ValidateSet('start','stop','status')][string]$Action = 'start')
$ErrorActionPreference = 'Stop'
& wsl.exe -d Ubuntu -u root --exec systemctl $Action diffsbdd-local.service
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($Action -eq 'start') { Write-Output 'Open http://127.0.0.1:7865 in your browser.' }
