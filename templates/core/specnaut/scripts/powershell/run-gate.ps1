#!/usr/bin/env pwsh
# Run one declared quality-gate tier. PowerShell twin of run-gate.sh.
#
#   run-gate.ps1 <fast|full>
#
# Reads `.specnaut/gates.yml` and runs the commands under `fast_gate:` or
# `full_gate:`, in order, from the repository root.
#
# This and its bash twin are the ONLY places the declaration is parsed. The
# per-child loop and the pre-merge step both call one of them; neither reads
# the file itself. A second parser is a second definition of what a gate is.
#
# It names no test tool, runner or framework, and it never will: the commands
# come from the project's file and are executed verbatim.
#
# Exit codes:
#   0   every command succeeded, OR the tier is not declared
#   1   a command exited non-zero — the tier failed
#   2   usage error
#
# A tier that is not declared is NOT a failure, and the script says so on
# stdout rather than passing in silence: "no gate ran" and "the gate passed"
# are different facts, and a caller that cannot tell them apart reports the
# wrong one.

param([Parameter(Position = 0)][string]$Tier)

if ($Tier -ne 'fast' -and $Tier -ne 'full') {
    Write-Error 'usage: run-gate.ps1 <fast|full>'
    exit 2
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# .specnaut/scripts/powershell/run-gate.ps1 -> the .specnaut directory
$specnautDir = (Resolve-Path (Join-Path $scriptDir '..' '..')).Path
$gates = Join-Path $specnautDir 'gates.yml'
$repoRoot = (Resolve-Path (Join-Path $specnautDir '..')).Path

if (-not (Test-Path -LiteralPath $gates -PathType Leaf)) {
    Write-Output "no $Tier gate declared — $gates is absent, so nothing ran"
    exit 0
}

# One flat list. The format is narrow on purpose (see gates.yml): a top-level
# `<tier>_gate:` key, then `  - ` items until the next top-level key. Quotes
# around an item are stripped as a matched pair only, so a command containing
# a quote is not silently mangled.
$key = "${Tier}_gate:"
$inside = $false
$commands = @()
foreach ($line in [System.IO.File]::ReadAllLines($gates)) {
    if ($line -match '^[^ \t#]') {
        $inside = $line.StartsWith($key)
        continue
    }
    if (-not $inside) { continue }
    if ($line -match '^[ \t]*#') { continue }
    if ($line -match '^[ \t]*$') { continue }
    if ($line -match '^[ \t]*-[ \t]*(.*)$') {
        $item = $Matches[1].TrimEnd()
        if ($item -eq '') { continue }
        if ($item.Length -ge 2) {
            $first = $item[0]; $last = $item[$item.Length - 1]
            if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
                $item = $item.Substring(1, $item.Length - 2)
            }
        }
        $commands += $item
    }
}

if ($commands.Count -eq 0) {
    Write-Output "no $Tier gate declared — ${Tier}_gate in $(Split-Path -Leaf $gates) is empty, so nothing ran"
    exit 0
}

$count = $commands.Count
Write-Output "running the $Tier gate — $count command(s) from $(Split-Path -Leaf $gates)"

$i = 0
foreach ($cmd in $commands) {
    $i++
    Write-Output "  [$i/$count] $cmd"
    # Push/pop per command: a command that changes directory must not silently
    # relocate the next one.
    Push-Location $repoRoot
    try {
        # Invoke-Expression is the direct analogue of bash's `eval`: the
        # command string is the project's and is run verbatim. Spawning a
        # child pwsh through a constructed $PSHOME path was the first draft
        # and is fragile across platforms for no gain.
        $global:LASTEXITCODE = 0
        Invoke-Expression $cmd
        # A native command sets $LASTEXITCODE; a failing cmdlet leaves it 0
        # and sets $? to false. Both are failures, so both are checked —
        # reading only one is how a gate passes on a command that did not.
        $rc = if ($LASTEXITCODE -ne 0) { $LASTEXITCODE } elseif (-not $?) { 1 } else { 0 }
    } finally {
        Pop-Location
    }
    if ($rc -ne 0) {
        Write-Error "  ✗ the $Tier gate failed at command $i/$count (exit $rc): $cmd"
        exit 1
    }
}

Write-Output "✓ the $Tier gate passed — $count of $count command(s)"
exit 0
