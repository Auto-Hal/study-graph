# Use a project-local npm when the host bundles Node without npm.
$ErrorActionPreference = 'Stop'
$studyGraphRoot = Split-Path -Parent $PSScriptRoot
$studyGraphNpm = Join-Path $studyGraphRoot '.tools/node_modules/npm/bin/npm-cli.js'
if (-not (Test-Path -LiteralPath $studyGraphNpm)) {
    throw 'Local npm is missing. See docs/DEVELOPMENT_SETUP.md.'
}
$studyGraphOriginalPath = $env:PATH
try {
    $env:PATH = (Join-Path $studyGraphRoot '.tools/node_modules/.bin') + [IO.Path]::PathSeparator + $env:PATH
    & node $studyGraphNpm @args
    $studyGraphExitCode = $LASTEXITCODE
} finally {
    $env:PATH = $studyGraphOriginalPath
}
exit $studyGraphExitCode
