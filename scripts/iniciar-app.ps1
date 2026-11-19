#requires -version 5.1
<#
.SYNOPSIS
  Sobe (ou para) o servidor do app (Fastify via tsx) em segundo plano.
.PARAMETER Parar
  Encerra somente o servidor registrado em scripts/.pids/app.pid.
#>
param([switch]$Parar)

$ErrorActionPreference = 'Stop'
$raiz   = Split-Path -Parent $PSScriptRoot
$pidDir = Join-Path $PSScriptRoot '.pids'
$logDir = Join-Path $PSScriptRoot '.logs'
$arqPid = Join-Path $pidDir 'app.pid'
. (Join-Path $PSScriptRoot 'comum.ps1')

try {
    if ($Parar) { Stop-ProcessoRegistrado 'app' $arqPid; exit 0 }

    $porta  = if ($env:PORTA_APP) { $env:PORTA_APP } else { '3000' }
    $saude  = "http://127.0.0.1:$porta/api/saude"
    New-Item -ItemType Directory -Force $pidDir, $logDir | Out-Null

    if (Test-Saude $saude) {
        Write-Host "app já em execução (porta $porta)"
    } elseif (Get-ProcessoRegistrado $arqPid) {
        Write-Host 'app já foi iniciado e ainda está subindo; aguardando'
    } elseif ($porta -match '^\d+$' -and (Test-PortaEscutando ([int]$porta))) {
        Write-Host "ERRO: a porta $porta já está em uso por outro programa. Feche-o ou defina PORTA_APP com outra porta."
        exit 1
    } else {
        $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
        $p = Start-Process -FilePath $npm -ArgumentList @('run', 'start', '--silent') -WorkingDirectory (Join-Path $raiz 'app/server') `
             -WindowStyle Hidden `
             -RedirectStandardOutput (Join-Path $logDir 'app.out.log') `
             -RedirectStandardError  (Join-Path $logDir 'app.err.log') -PassThru
        Save-PidRegistro $arqPid $p
        Write-Host "app iniciado (PID $($p.Id))"
    }

    # --- Esperar /api/saude (limite 60 s; desiste cedo se o processo morrer) ---
    $limite = (Get-Date).AddSeconds(60)
    $estado = 'tempo'
    while ((Get-Date) -lt $limite) {
        if (Test-Saude $saude) { $estado = 'ok'; break }
        if (-not (Get-ProcessoRegistrado $arqPid)) { $estado = 'morreu'; break }
        Start-Sleep -Seconds 1
    }
    if ($estado -eq 'ok') { Write-Host "app OK em http://127.0.0.1:$porta"; exit 0 }

    if ($estado -eq 'morreu') { Write-Host 'ERRO: o servidor do app encerrou antes de responder.' }
    else { Write-Host 'ERRO: o servidor do app não respondeu em 60 s.' }
    $errLog = Join-Path $logDir 'app.err.log'
    if (Test-Path $errLog) { Get-Content $errLog -Tail 8 -Encoding UTF8 | ForEach-Object { Write-Host "  $_" } }
    Write-Host 'Detalhes em scripts/.logs/app.err.log e scripts/.logs/app.out.log'
    exit 1
} catch {
    Write-Host "ERRO: $($_.Exception.Message)"
    exit 1
}
