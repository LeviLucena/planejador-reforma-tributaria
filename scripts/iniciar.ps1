#requires -version 5.1
<#
.SYNOPSIS
  Launcher completo: confere pré-requisitos, sobe motores e app, abre o navegador.
.PARAMETER Reconstruir
  Força a reconstrução da interface web (npm -w app/web run build).
#>
param([switch]$Reconstruir)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'comum.ps1')
Set-Location $raiz

function Stop-Launcher([string]$msg) { Write-Host ''; Write-Host "ERRO: $msg"; exit 1 }

Write-Host '=== Planejador da Reforma Tributária ==='

# (a) Node >= 22
$nodeVer = $null
try { $nodeVer = (& node --version) } catch { }
if (-not $nodeVer -or $nodeVer -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22) {
    Stop-Launcher ("Node.js 22 ou mais novo não encontrado (encontrado: " + $(if ($nodeVer) { $nodeVer } else { 'nenhum' }) + ").`n       Instale com: winget install OpenJS.NodeJS.LTS   (ou https://nodejs.org)`n       Depois feche e abra este programa de novo.")
}
Write-Host "Node: $nodeVer"

# (b) JDK 21
if (-not (Find-Jdk21)) {
    Stop-Launcher "JDK 21 não encontrado.`n       Instale com: winget install EclipseAdoptium.Temurin.21.JDK`n       Depois feche e abra este programa de novo."
}

# (c) npm install somente se faltar node_modules
if (-not (Test-Path (Join-Path $raiz 'node_modules'))) {
    Write-Host 'Instalando dependências (npm install)...'
    & npm.cmd install
    if ($LASTEXITCODE -ne 0) { Stop-Launcher 'npm install falhou.' }
}

# (d) motores
Write-Host '--- Motores oficiais ---'
& (Join-Path $PSScriptRoot 'iniciar-motores.ps1')
if ($LASTEXITCODE -ne 0) { Stop-Launcher 'os motores não subiram. Veja scripts/.logs/' }

# (e) build da interface se faltar ou estiver desatualizada
$indice = Join-Path $raiz 'app/web/dist/index.html'
$precisa = $Reconstruir.IsPresent -or -not (Test-Path $indice)
if (-not $precisa) {
    $t = (Get-Item $indice).LastWriteTime
    $fontes = @(Get-ChildItem (Join-Path $raiz 'app/web/src') -Recurse -File) + @(Get-Item (Join-Path $raiz 'app/web/index.html') -ErrorAction SilentlyContinue)
    $precisa = [bool]($fontes | Where-Object { $_.LastWriteTime -gt $t } | Select-Object -First 1)
}
if ($precisa) {
    Write-Host '--- Construindo a interface (npm -w app/web run build) ---'
    & npm.cmd -w app/web run build
    if ($LASTEXITCODE -ne 0) { Stop-Launcher 'a construção da interface falhou.' }
} else {
    Write-Host 'Interface já construída e atualizada.'
}

# (f)(g) servidor do app
Write-Host '--- Servidor do app ---'
& (Join-Path $PSScriptRoot 'iniciar-app.ps1')
if ($LASTEXITCODE -ne 0) { Stop-Launcher 'o servidor do app não subiu.' }

$porta = if ($env:PORTA_APP) { $env:PORTA_APP } else { '3000' }
$url = "http://127.0.0.1:$porta"
Write-Host ''
Write-Host "Tudo no ar. Endereço do sistema: $url"
Write-Host 'Para encerrar tudo, execute scripts/parar.bat'

# (h) navegador
if ($env:NAO_ABRIR_NAVEGADOR -eq '1') { Write-Host 'NAO_ABRIR_NAVEGADOR=1: navegador não aberto.' }
else { Start-Process $url }
exit 0
