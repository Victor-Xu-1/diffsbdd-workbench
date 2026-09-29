[CmdletBinding()]
param(
    [ValidateSet('doctor', 'demo', 'generate', 'inpaint', 'optimize', 'diversify')][string]$Action = 'doctor',
    [string]$Protein,
    [string]$Reference,
    [string[]]$Residues,
    [ValidateRange(1, 100)][int]$Count = 3,
    [ValidateRange(8, 80)][int]$Atoms = 32,
    [ValidateRange(0, 2147483647)][int]$Seed = 2026,
    [string]$Output,
    [string]$Settings,
    [string]$InitialLigand
)
$ErrorActionPreference = 'Stop'
if (-not $Output) { $Output = Join-Path $PSScriptRoot 'runs' }

function Convert-ToLinuxPath([string]$Path, [bool]$MustExist = $true) {
    if ($MustExist) { $resolved = (Resolve-Path -LiteralPath $Path).Path }
    else { $resolved = [IO.Path]::GetFullPath($Path) }
    $converted = & wsl.exe -d Ubuntu --exec wslpath -a $resolved.Replace('\', '/')
    if ($LASTEXITCODE -ne 0) { throw "Cannot convert path: $resolved" }
    return ($converted -join '').Trim()
}

$linuxRoot = Convert-ToLinuxPath $PSScriptRoot
$arguments = @('-m', 'local_diffsbdd', $Action)
if ($Action -ne 'doctor') {
    $arguments += @('--count', "$Count", '--atoms', "$Atoms", '--seed', "$Seed",
                    '--output', (Convert-ToLinuxPath $Output $false))
    if ($Settings) { $arguments += @('--settings', (Convert-ToLinuxPath $Settings)) }
}
if ($Action -in @('generate', 'inpaint', 'optimize', 'diversify')) {
    if (-not $Protein) { throw 'generate requires -Protein.' }
    if ([bool]$Reference -eq [bool]$Residues) { throw 'Specify exactly one of -Reference or -Residues.' }
    $arguments += @('--protein', (Convert-ToLinuxPath $Protein))
    if ($Reference) {
        if ($Reference -match '^[A-Za-z0-9]:-?\d+$') { $referenceArg = $Reference }
        else { $referenceArg = Convert-ToLinuxPath $Reference }
        $arguments += @('--reference', $referenceArg)
    }
    foreach ($residue in $Residues) { $arguments += @('--residue', $residue) }
}
if ($Action -in @('inpaint', 'optimize', 'diversify')) {
    if (-not $InitialLigand) { throw 'This design task requires -InitialLigand.' }
    $arguments += @('--initial-ligand', (Convert-ToLinuxPath $InitialLigand))
}
& wsl.exe -d Ubuntu --cd $linuxRoot --exec env PYTHONDONTWRITEBYTECODE=1 MPLBACKEND=Agg WANDB_MODE=disabled /opt/diffsbdd/venv/bin/python @arguments
exit $LASTEXITCODE
