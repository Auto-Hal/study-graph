# Portable PostgreSQL from the binary archive linked by PostgreSQL.org / EDB.
# No system service, registry, global PATH, or application credentials.
$ErrorActionPreference = 'Stop'
$studyGraphRoot = Split-Path -Parent $PSScriptRoot
$studyGraphVersion = '17.11-5'
$studyGraphTools = Join-Path $studyGraphRoot '.tools'
$studyGraphArchive = Join-Path $studyGraphTools "postgresql-$studyGraphVersion-windows-x64-binaries.zip"
$studyGraphInstall = Join-Path $studyGraphTools 'postgresql-17.11'
$studyGraphPsql = Join-Path $studyGraphInstall 'pgsql/bin/psql.exe'
$studyGraphDownloadUrl = "https://get.enterprisedb.com/postgresql/postgresql-$studyGraphVersion-windows-x64-binaries.zip"
New-Item -ItemType Directory -Path $studyGraphTools -Force | Out-Null
if (-not (Test-Path -LiteralPath $studyGraphArchive)) {
    & curl.exe --fail --location --silent --show-error --output "$studyGraphArchive.partial" $studyGraphDownloadUrl
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL archive download failed.' }
    Move-Item -LiteralPath "$studyGraphArchive.partial" -Destination $studyGraphArchive
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$studyGraphZip = [IO.Compression.ZipFile]::OpenRead($studyGraphArchive)
try {
    $studyGraphPrefix = [IO.Path]::GetFullPath($studyGraphInstall) + [IO.Path]::DirectorySeparatorChar
    foreach ($studyGraphEntry in $studyGraphZip.Entries) {
        if ($studyGraphEntry.FullName -notmatch '^pgsql/(bin|lib|share)/' -or $studyGraphEntry.FullName.EndsWith('/')) { continue }
        $studyGraphTarget = [IO.Path]::GetFullPath((Join-Path $studyGraphInstall $studyGraphEntry.FullName))
        if (-not $studyGraphTarget.StartsWith($studyGraphPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive path outside portable installation.' }
        New-Item -ItemType Directory -Path (Split-Path -Parent $studyGraphTarget) -Force | Out-Null
        [IO.Compression.ZipFileExtensions]::ExtractToFile($studyGraphEntry, $studyGraphTarget, $true)
    }
} finally {
    $studyGraphZip.Dispose()
}
$studyGraphArchiveHash = (Get-FileHash -LiteralPath $studyGraphArchive -Algorithm SHA256).Hash.ToLowerInvariant()
@{ source = $studyGraphDownloadUrl; version = $studyGraphVersion; sha256 = $studyGraphArchiveHash } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $studyGraphInstall 'download.json') -Encoding UTF8
& $studyGraphPsql --version
if ($LASTEXITCODE -ne 0) { throw 'Portable psql could not run.' }
Write-Host 'Portable PostgreSQL ready. Run ./scripts/test-db-local.ps1 for isolated tests.'
