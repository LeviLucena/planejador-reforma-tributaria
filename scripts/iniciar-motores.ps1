#requires -version 5.1
<#
.SYNOPSIS
  Sobe (ou para) os dois motores oficiais da Reforma Tributaria.
.PARAMETER Parar
  Encerra somente os processos iniciados por este script (PID files em scripts\.pids).
#>
param([switch]$Parar)

$ErrorActionPreference = 'Stop'
$raiz     = Split-Path -Parent $PSScriptRoot
$pidDir   = Join-Path $PSScriptRoot '.pids'
$logDir   = Join-Path $PSScriptRoot '.logs'
$motores  = Join-Path $raiz 'motores'

$defs = @(
    @{ Nome = 'regime-regular';   Dir = Join-Path $motores 'regime-regular';   Jar = 'target\api-regime-geral.jar';     Porta = 8080; Health = 'http://localhost:8080/api/swagger-ui.html'; Extra = @() },
    @{ Nome = 'simples-nacional'; Dir = Join-Path $motores 'simples-nacional'; Jar = 'target\api-simples-nacional.jar'; Porta = 8082; Health = 'http://localhost:8082/api/versao';          Extra = @('-Dserver.port=8082') }
)

function Test-Saude($url) {
    try { return ((Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) } catch { return $false }
}

if ($Parar) {
    foreach ($d in $defs) {
        $f = Join-Path $pidDir ($d.Nome + '.pid')
        if (Test-Path $f) {
            $p = [int](Get-Content $f -Raw).Trim()
            $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
            if ($proc -and $proc.ProcessName -like 'java*') {
                Stop-Process -Id $p -Force
                Write-Host "$($d.Nome) parado (PID $p)"
            } else {
                Write-Host "$($d.Nome): processo $p não está mais ativo"
            }
            Remove-Item $f -Force
        } else {
            Write-Host "$($d.Nome): nenhum processo registrado por este script"
        }
    }
    return
}

# --- JDK 21 ---
$jdk = Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue |
       Sort-Object Name -Descending | Select-Object -First 1
if (-not $jdk) { throw 'JDK 21 não encontrado em C:\Program Files\Eclipse Adoptium\jdk-21*' }
$env:JAVA_HOME = $jdk.FullName
$env:Path = (Join-Path $jdk.FullName 'bin') + ';' + $env:Path
$java = Join-Path $jdk.FullName 'bin\java.exe'
Write-Host "JDK: $($jdk.FullName)"

New-Item -ItemType Directory -Force $pidDir, $logDir | Out-Null

# --- Banco de dados ---
$rr = $defs[0].Dir; $sn = $defs[1].Dir
$db = Join-Path $rr 'calculadora\db\calculadora-pro.db'
if (-not (Test-Path $db)) {
    Write-Host 'Gerando calculadora-pro.db (flyway)...'
    Push-Location $rr
    try {
        & .\mvnw.cmd flyway:migrate '-Dflyway.configFiles=flyway\flyway-pro.conf'
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar o banco' }
    } finally { Pop-Location }
}
$dbSn = Join-Path $sn 'calculadora\db\calculadora-pro.db'
if (-not (Test-Path $dbSn)) {
    New-Item -ItemType Directory -Force (Split-Path $dbSn) | Out-Null
    Copy-Item $db $dbSn
    Write-Host 'Banco copiado para simples-nacional'
}

# --- JARs ---
foreach ($d in $defs) {
    $jar = Join-Path $d.Dir $d.Jar
    if (-not (Test-Path $jar)) {
        Write-Host "Compilando $($d.Nome)..."
        Push-Location $d.Dir
        try {
            & .\mvnw.cmd clean package -DskipTests
            if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar $($d.Nome)" }
        } finally { Pop-Location }
    }
}

# --- Subir ---
$iniciados = @()
foreach ($d in $defs) {
    if (Test-Saude $d.Health) {
        Write-Host "$($d.Nome) já em execução (porta $($d.Porta))"
        continue
    }
    $argsJava = @('-Dspring.profiles.active=offline') + $d.Extra + @('-jar', $d.Jar)
    $p = Start-Process -FilePath $java -ArgumentList $argsJava -WorkingDirectory $d.Dir -WindowStyle Hidden `
         -RedirectStandardOutput (Join-Path $logDir "$($d.Nome).out.log") `
         -RedirectStandardError  (Join-Path $logDir "$($d.Nome).err.log") -PassThru
    Set-Content -Path (Join-Path $pidDir ($d.Nome + '.pid')) -Value $p.Id
    Write-Host "$($d.Nome) iniciado (PID $($p.Id))"
    $iniciados += $d
}

# --- Esperar saude (limite 120 s) ---
$falhou = $false
foreach ($d in $defs) {
    $limite = (Get-Date).AddSeconds(120)
    $ok = $false
    while ((Get-Date) -lt $limite) {
        if (Test-Saude $d.Health) { $ok = $true; break }
        Start-Sleep -Seconds 2
    }
    if ($ok) { Write-Host "$($d.Nome) OK" }
    else { Write-Host "$($d.Nome) NÃO respondeu em 120 s (veja scripts\.logs)"; $falhou = $true }
}
if ($falhou) { exit 1 }
