param([ValidateSet('db', 'e2e')] [string]$Suite = 'db')
# Disposable localhost database; never reads .env.local or connects to hosted DBs.
$ErrorActionPreference = 'Stop'
$studyGraphRoot = Split-Path -Parent $PSScriptRoot
$studyGraphBin = Join-Path $studyGraphRoot '.tools/postgresql-17.11/pgsql/bin'
$studyGraphPsql = Join-Path $studyGraphBin 'psql.exe'
$studyGraphInitdb = Join-Path $studyGraphBin 'initdb.exe'
$studyGraphPgCtl = Join-Path $studyGraphBin 'pg_ctl.exe'
if (-not (Test-Path -LiteralPath $studyGraphPsql)) { throw 'Run ./scripts/setup-postgres-local.ps1 first.' }
$studyGraphClusterParent = Join-Path $studyGraphRoot '.tools/pg-test-clusters'
New-Item -ItemType Directory -Path $studyGraphClusterParent -Force | Out-Null
if ((Get-Item -LiteralPath $studyGraphClusterParent).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Cluster parent cannot be a link.' }
$studyGraphCluster = Join-Path $studyGraphClusterParent ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $studyGraphCluster | Out-Null
$studyGraphData = Join-Path $studyGraphCluster 'data'
$studyGraphLog = Join-Path $studyGraphCluster 'postgres.log'
$studyGraphPasswordFile = Join-Path $studyGraphCluster 'password.tmp'
$studyGraphPassword = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
[IO.File]::WriteAllText($studyGraphPasswordFile, $studyGraphPassword, [Text.Encoding]::ASCII)
$studyGraphListener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$studyGraphListener.Start()
$studyGraphPort = $studyGraphListener.LocalEndpoint.Port
$studyGraphListener.Stop()
$studyGraphSavedEnv = @{}
foreach ($studyGraphKey in @('STUDY_GRAPH_ISOLATED_DB', 'STUDY_GRAPH_TEST_DATABASE_URL', 'STUDY_GRAPH_TEST_PSQL')) {
    $studyGraphSavedEnv[$studyGraphKey] = [Environment]::GetEnvironmentVariable($studyGraphKey, 'Process')
}
$studyGraphStarted = $false
$studyGraphStopped = $true
$studyGraphResult = 1
try {
    & $studyGraphInitdb -D $studyGraphData -U postgres -E UTF8 --locale=C --auth=scram-sha-256 --pwfile=$studyGraphPasswordFile
    if ($LASTEXITCODE -ne 0) { throw 'Isolated initdb failed.' }
    Remove-Item -LiteralPath $studyGraphPasswordFile
    & $studyGraphPgCtl -D $studyGraphData -l $studyGraphLog -o "-h 127.0.0.1 -p $studyGraphPort" -w start
    if ($LASTEXITCODE -ne 0) { throw "Isolated PostgreSQL startup failed. See $studyGraphLog" }
    $studyGraphStarted = $true
    $studyGraphStopped = $false
    $env:STUDY_GRAPH_ISOLATED_DB = '1'
    $env:STUDY_GRAPH_TEST_DATABASE_URL = "postgresql://postgres:$studyGraphPassword@127.0.0.1:$studyGraphPort/postgres"
    $env:STUDY_GRAPH_TEST_PSQL = $studyGraphPsql
    Push-Location $studyGraphRoot
    try {
        & node --experimental-strip-types "scripts/test-$Suite.mjs"
        $studyGraphResult = $LASTEXITCODE
    } finally { Pop-Location }
} finally {
    if ($studyGraphStarted) {
        & $studyGraphPgCtl -D $studyGraphData -m fast -w stop
        $studyGraphStopped = $LASTEXITCODE -eq 0
        if (-not $studyGraphStopped) { $studyGraphResult = 1; Write-Warning "Database stop failed; inspect $studyGraphLog" }
    }
    foreach ($studyGraphKey in $studyGraphSavedEnv.Keys) {
        [Environment]::SetEnvironmentVariable($studyGraphKey, $studyGraphSavedEnv[$studyGraphKey], 'Process')
    }
    if (Test-Path -LiteralPath $studyGraphPasswordFile) { Remove-Item -LiteralPath $studyGraphPasswordFile }
    if ($studyGraphResult -eq 0 -and $studyGraphStopped) {
        $studyGraphResolvedCluster = (Resolve-Path -LiteralPath $studyGraphCluster).Path
        $studyGraphResolvedParent = (Resolve-Path -LiteralPath $studyGraphClusterParent).Path + [IO.Path]::DirectorySeparatorChar
        if (-not $studyGraphResolvedCluster.StartsWith($studyGraphResolvedParent, [StringComparison]::OrdinalIgnoreCase) -or
            (Get-Item -LiteralPath $studyGraphResolvedCluster).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Unsafe cluster cleanup path.' }
        Remove-Item -LiteralPath $studyGraphResolvedCluster -Recurse -Force
        Write-Host 'All isolated suites passed. PostgreSQL stopped and disposable cluster removed.'
    } else {
        Write-Host "Failed test cluster retained for diagnosis: $studyGraphCluster"
    }
}
exit $studyGraphResult
