<#
.SYNOPSIS
  Laver en tidsstemplet zip-backup af projektet i backups/ og beholder de nyeste.

.DESCRIPTION
  Zip-filen indeholder:
    - alle projektfiler (uden .git og backups/)
    - repo.bundle: hele git-historikken (kan gendannes med: git clone repo.bundle <mappe>)
  Laaste filer (fx en .docx, der er aaben i Word) springes over med en advarsel.
  backups/ ligger i OneDrive-mappen og synkroniseres derfor ogsaa til skyen.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
  powershell -ExecutionPolicy Bypass -File scripts\backup.ps1 -Label foer-firebase -Keep 30
#>
param(
  [string]$Label = '',
  [int]$Keep = 15
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root 'backups'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$commit = ''
if (Get-Command git -ErrorAction SilentlyContinue) {
  $commit = (& git -C $root rev-parse --short HEAD 2>$null)
  if ($LASTEXITCODE -ne 0) { $commit = '' }
}
$name = "jfm_$stamp"
if ($commit) { $name += "_$commit" }
if ($Label) { $name += '_' + ($Label -replace '[^A-Za-z0-9_-]', '-') }

$staging = Join-Path ([IO.Path]::GetTempPath()) ("jfm-backup-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging | Out-Null

try {
  $skipped = @()
  $files = Get-ChildItem -Path $root -Recurse -File -Force | Where-Object {
    $rel = $_.FullName.Substring($root.Length + 1)
    -not ($rel -like '.git\*' -or $rel -like 'backups\*' -or $_.Name -like '~$*')
  }
  foreach ($file in $files) {
    $rel = $file.FullName.Substring($root.Length + 1)
    $target = Join-Path $staging $rel
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    try { Copy-Item -LiteralPath $file.FullName -Destination $target -ErrorAction Stop }
    catch { $skipped += $rel }
  }

  if ($commit) {
    & git -C $root bundle create (Join-Path $staging 'repo.bundle') --all 2>$null | Out-Null
  }

  $zip = Join-Path $dest "$name.zip"
  Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zip -CompressionLevel Optimal
  Write-Host "Backup gemt: $zip"
  foreach ($s in $skipped) { Write-Warning "Sprunget over (laast/i brug): $s" }

  # Behold kun de nyeste $Keep backups
  $old = Get-ChildItem -Path $dest -Filter 'jfm_*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep
  foreach ($o in $old) {
    Remove-Item -LiteralPath $o.FullName -Force
    Write-Host "Slettet gammel backup: $($o.Name)"
  }
}
finally {
  Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
}
