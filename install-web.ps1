$ErrorActionPreference = 'Stop'
$linuxRoot = ((& wsl.exe -d Ubuntu --exec wslpath -a $PSScriptRoot.Replace('\', '/')) -join '').Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve the deployment folder in WSL.' }
$uid = ((& wsl.exe -d Ubuntu --exec id -u) -join '').Trim()
if ($uid -notmatch '^\d+$') { throw 'Cannot identify the WSL user.' }
$unit = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'diffsbdd-local.service.in') -Raw).Replace('@PACKAGE_DIR@', $linuxRoot).Replace('@UID@', $uid)
$unitPath = Join-Path $PSScriptRoot 'diffsbdd-local.service'
[IO.File]::WriteAllText($unitPath, $unit.Replace("`r`n", "`n"), [Text.UTF8Encoding]::new($false))
& wsl.exe -d Ubuntu --exec mkdir -p /opt/diffsbdd/state/matplotlib
& wsl.exe -d Ubuntu -u root --exec install -m 0644 "$linuxRoot/diffsbdd-local.service" /etc/systemd/system/diffsbdd-local.service
if ($LASTEXITCODE -ne 0) { throw 'Cannot install the systemd unit.' }
& wsl.exe -d Ubuntu -u root --exec systemctl daemon-reload
& wsl.exe -d Ubuntu -u root --exec systemctl enable --now diffsbdd-local.service
if ($LASTEXITCODE -ne 0) { throw 'Cannot start the web service.' }
$serviceState = ((& wsl.exe -d Ubuntu --exec systemctl is-active diffsbdd-local.service) -join '').Trim()
if ($serviceState -ne 'active') { throw "Web service did not become active: $serviceState" }
Add-Type -AssemblyName System.Net.Http
$client = [System.Net.Http.HttpClient]::new([System.Net.Http.HttpClientHandler]@{ UseProxy = $false })
$client.Timeout = [TimeSpan]::FromSeconds(2)
try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try { $response = $client.GetAsync('http://127.0.0.1:7865/api/health').GetAwaiter().GetResult(); $ready = $response.IsSuccessStatusCode; $response.Dispose() } catch { $ready = $false }
        if ($ready) { break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'The service did not respond within 30 seconds. Check journalctl -u diffsbdd-local.' }
} finally { $client.Dispose() }
Write-Output 'DiffSBDD: http://127.0.0.1:7865'
