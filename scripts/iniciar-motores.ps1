#requires -version 5.1
<#
.SYNOPSIS
  Sobe (ou para) os dois motores oficiais da Reforma Tributária.
.PARAMETER Parar
  Encerra somente os processos iniciados por este script (registros em scripts/.pids).
#>
param([switch]$Parar)

$ErrorActionPreference = 'Stop'
$raiz    = Split-Path -Parent $PSScriptRoot
$pidDir  = Join-Path $PSScriptRoot '.pids'
$logDir  = Join-Path $PSScriptRoot '.logs'
$motores = Join-Path $raiz 'motores'
. (Join-Path $PSScriptRoot 'comum.ps1')

$defs = @(
    @{ Nome = 'regime-regular';   Dir = Join-Path $motores 'regime-regular';   Jar = 'target/api-regime-geral.jar';     Porta = 8080; Health = 'http://localhost:8080/api/swagger-ui.html'; Extra = @() },
    @{ Nome = 'simples-nacional'; Dir = Join-Path $motores 'simples-nacional'; Jar = 'target/api-simples-nacional.jar'; Porta = 8082; Health = 'http://localhost:8082/api/versao';          Extra = @('-Dserver.port=8082') }
)

try {
    if ($Parar) {
        foreach ($d in $defs) { Stop-ProcessoRegistrado $d.Nome (Join-Path $pidDir ($d.Nome + '.pid')) }
        exit 0
    }

    # --- JDK 21 ---
    $jdk = Find-Jdk21
    if (-not $jdk) {
        Write-Host 'ERRO: JDK 21 não encontrado em C:/Program Files/Eclipse Adoptium/jdk-21*'
        Write-Host '      Instale com: winget install EclipseAdoptium.Temurin.21.JDK'
        exit 1
    }
    $env:JAVA_HOME = $jdk.FullName
    $env:Path = (Join-Path $jdk.FullName 'bin') + ';' + $env:Path
    $java = Join-Path $jdk.FullName 'bin/java.exe'
    Write-Host "JDK: $($jdk.FullName)"

    New-Item -ItemType Directory -Force $pidDir, $logDir | Out-Null

    # --- Banco de dados (gerado somente se faltar) ---
    $rr = $defs[0].Dir; $sn = $defs[1].Dir
    $db = Join-Path $rr 'calculadora/db/calculadora-pro.db'
    if (-not (Test-Path $db)) {
        Write-Host 'Gerando calculadora-pro.db (flyway)...'
        Push-Location $rr
        try {
            & ./mvnw.cmd flyway:migrate '-Dflyway.configFiles=flyway/flyway-pro.conf'
            if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar o banco do motor' }
        } finally { Pop-Location }
    }
    $dbSn = Join-Path $sn 'calculadora/db/calculadora-pro.db'
    if (-not (Test-Path $dbSn)) {
        New-Item -ItemType Directory -Force (Split-Path $dbSn) | Out-Null
        Copy-Item $db $dbSn
        Write-Host 'Banco copiado para simples-nacional'
    }

    # --- JARs (compilados somente se faltarem) ---
    foreach ($d in $defs) {
        if (-not (Test-Path (Join-Path $d.Dir $d.Jar))) {
            Write-Host "Compilando $($d.Nome)..."
            Push-Location $d.Dir
            try {
                & ./mvnw.cmd clean package -DskipTests
                if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar $($d.Nome)" }
            } finally { Pop-Location }
        }
    }

    # --- Subir (idempotente) ---
    foreach ($d in $defs) {
        $arqPid = Join-Path $pidDir ($d.Nome + '.pid')
        if (Test-Saude $d.Health) {
            Write-Host "$($d.Nome) já em execução (porta $($d.Porta))"
        } elseif (Get-ProcessoRegistrado $arqPid) {
            Write-Host "$($d.Nome) já foi iniciado e ainda está subindo; aguardando"
        } elseif (Test-PortaEscutando $d.Porta) {
            Write-Host "$($d.Nome): a porta $($d.Porta) já está em uso e o motor ainda não respondeu; aguardando"
        } else {
            $argsJava = @('-Dspring.profiles.active=offline') + $d.Extra + @('-jar', $d.Jar)
            $p = Start-Process -FilePath $java -ArgumentList $argsJava -WorkingDirectory $d.Dir -WindowStyle Hidden `
                 -RedirectStandardOutput (Join-Path $logDir "$($d.Nome).out.log") `
                 -RedirectStandardError  (Join-Path $logDir "$($d.Nome).err.log") -PassThru
            Save-PidRegistro $arqPid $p
            Write-Host "$($d.Nome) iniciado (PID $($p.Id))"
        }
    }

    # --- Esperar saúde (limite total de 120 s; desiste cedo se o processo morrer) ---
    $limite = (Get-Date).AddSeconds(120)
    $falhou = $false
    foreach ($d in $defs) {
        $arqPid = Join-Path $pidDir ($d.Nome + '.pid')
        $estado = 'tempo'
        while ((Get-Date) -lt $limite) {
            if (Test-Saude $d.Health) { $estado = 'ok'; break }
            if (-not (Get-ProcessoRegistrado $arqPid) -and -not (Test-PortaEscutando $d.Porta)) { $estado = 'morreu'; break }
            Start-Sleep -Seconds 2
        }
        switch ($estado) {
            'ok'     { Write-Host "$($d.Nome) OK" }
            'morreu' { Write-Host "$($d.Nome): o processo encerrou antes de responder. Veja scripts/.logs/$($d.Nome).err.log"; $falhou = $true }
            default  { Write-Host "$($d.Nome) NÃO respondeu a tempo (limite de 120 s). Veja scripts/.logs"; $falhou = $true }
        }
    }
    if ($falhou) { exit 1 }
    exit 0
} catch {
    Write-Host "ERRO: $($_.Exception.Message)"
    exit 1
}
