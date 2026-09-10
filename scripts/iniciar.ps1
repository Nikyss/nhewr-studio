param([switch]$NoBrowser, [switch]$CheckOnly, [switch]$Portable)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot

function Test-NodeVersion([string]$Executable) {
  if (-not $Executable -or -not (Test-Path -LiteralPath $Executable)) { return $false }
  try {
    $reportedVersion = & $Executable --version 2>$null
    return $LASTEXITCODE -eq 0 -and ([version]$reportedVersion.Trim().TrimStart('v')) -ge [version]'22.13.0'
  } catch { return $false }
}

try {
  Write-Host 'Nhewr Studios - preparando o editor local...'
  $runtimeRoot = Join-Path $projectRoot '.runtime'
  $releaseEntry = Join-Path $projectRoot 'release\index.html'
  $needsNpm = -not (Test-Path -LiteralPath $releaseEntry)
  $nodeExecutable = $null
  if (-not $Portable) {
    $installedNode = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($installedNode -and (Test-NodeVersion $installedNode.Source)) {
      $npmPath = Join-Path (Split-Path -Parent $installedNode.Source) 'node_modules\npm\bin\npm-cli.js'
      if (-not $needsNpm -or (Test-Path -LiteralPath $npmPath)) { $nodeExecutable = $installedNode.Source }
    }
  }
  if (-not $nodeExecutable -and (Test-Path -LiteralPath $runtimeRoot)) {
    foreach ($candidate in (Get-ChildItem -LiteralPath $runtimeRoot -Filter node.exe -Recurse -File)) {
      $npmPath = Join-Path $candidate.DirectoryName 'node_modules\npm\bin\npm-cli.js'
      if ((Test-NodeVersion $candidate.FullName) -and (-not $needsNpm -or (Test-Path -LiteralPath $npmPath))) { $nodeExecutable = $candidate.FullName; break }
    }
  }
  if (-not $nodeExecutable) {
    Write-Host 'Baixando Node.js portatil do site oficial. Nenhuma instalacao no Windows e necessaria.'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
    $baseUrl = 'https://nodejs.org/dist/latest-v24.x/'
    $sums = (Invoke-WebRequest -Uri ($baseUrl + 'SHASUMS256.txt') -UseBasicParsing -TimeoutSec 60).Content
    $pattern = '(?m)^([a-f0-9]{64})\s+(node-v24\.\d+\.\d+-win-' + $architecture + '\.zip)\s*$'
    $match = [regex]::Match($sums, $pattern)
    if (-not $match.Success) { throw 'Nao foi possivel verificar o pacote oficial do Node.js.' }
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
    $archive = Join-Path $runtimeRoot $match.Groups[2].Value
    Invoke-WebRequest -Uri ($baseUrl + $match.Groups[2].Value) -OutFile $archive -UseBasicParsing -TimeoutSec 300
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $match.Groups[1].Value) {
      Remove-Item -LiteralPath $archive -Force
      throw 'A verificacao do download falhou. Execute INICIAR.bat novamente.'
    }
    Expand-Archive -LiteralPath $archive -DestinationPath $runtimeRoot -Force
    Remove-Item -LiteralPath $archive -Force
    $nodeExecutable = Join-Path $runtimeRoot ($match.Groups[2].Value.Replace('.zip', '') + '\node.exe')
    if (-not (Test-NodeVersion $nodeExecutable)) { throw 'O Node.js baixado nao pode ser executado neste Windows.' }
  }
  $env:PATH = (Split-Path -Parent $nodeExecutable) + ';' + $env:PATH
  if (-not (Test-Path -LiteralPath $releaseEntry)) {
    Write-Host 'Preparando dependencias e interface. Isso e necessario apenas na primeira execucao do codigo-fonte.'
    $npmCli = Join-Path (Split-Path -Parent $nodeExecutable) 'node_modules\npm\bin\npm-cli.js'
    if (-not (Test-Path -LiteralPath $npmCli)) { throw 'Esta instalacao do Node nao inclui npm. Execute scripts\iniciar.ps1 -Portable.' }
    & $nodeExecutable $npmCli ci --include=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao baixar dependencias. Verifique sua conexao e tente novamente.' }
    & $nodeExecutable $npmCli run build
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao montar a interface.' }
  }
  if ($CheckOnly) { Write-Host 'Node.js e interface prontos.'; exit 0 }
  $arguments = @((Join-Path $PSScriptRoot 'local-server.mjs'))
  if ($NoBrowser) { $arguments += '--no-open' }
  & $nodeExecutable @arguments
  exit $LASTEXITCODE
} catch {
  Write-Host ('Erro: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
