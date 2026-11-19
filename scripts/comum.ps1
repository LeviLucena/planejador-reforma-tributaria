# Funcoes compartilhadas pelos scripts do launcher (carregado com dot-source).
# Obs.: caminhos usam barra normal, que o PowerShell e o Node aceitam no Windows.

function Test-Saude([string]$url) {
    try { return ((Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) } catch { return $false }
}

function Test-PortaEscutando([int]$porta) {
    return [bool](Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue)
}

function Find-Jdk21 {
    return Get-ChildItem 'C:/Program Files/Eclipse Adoptium' -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue |
           Sort-Object Name -Descending | Select-Object -First 1
}

# Grava "PID|inicio" (inicio = StartTime em ticks UTC) para reconhecer o processo depois.
function Save-PidRegistro([string]$arquivo, $proc) {
    $inicio = $proc.StartTime.ToUniversalTime().Ticks
    Set-Content -Path $arquivo -Value "$($proc.Id)|$inicio"
}

# Devolve o processo registrado SE ainda for o mesmo (mesmo PID e mesmo horario de inicio).
# Registro obsoleto (processo morreu, PID reaproveitado, formato antigo) e removido e devolve $null.
function Get-ProcessoRegistrado([string]$arquivo) {
    if (-not (Test-Path $arquivo)) { return $null }
    $partes = (Get-Content $arquivo -Raw).Trim().Split('|')
    $proc = $null
    if ($partes.Count -eq 2 -and $partes[0] -match '^\d+$' -and $partes[1] -match '^\d+$') {
        $proc = Get-Process -Id ([int]$partes[0]) -ErrorAction SilentlyContinue
        if ($proc) {
            try {
                $dif = [math]::Abs($proc.StartTime.ToUniversalTime().Ticks - [int64]$partes[1])
                if ($dif -gt 20000000) { $proc = $null }   # mais de 2 s de diferenca: e outro processo
            } catch { $proc = $null }
        }
    }
    if (-not $proc) { Remove-Item $arquivo -Force -ErrorAction SilentlyContinue }
    return $proc
}

# Para o processo registrado (e seus filhos) somente se o registro ainda for valido.
function Stop-ProcessoRegistrado([string]$nome, [string]$arquivo) {
    if (-not (Test-Path $arquivo)) { Write-Host "${nome}: nenhum processo registrado por estes scripts"; return }
    $proc = Get-ProcessoRegistrado $arquivo
    if ($proc) {
        & taskkill.exe /T /F /PID $proc.Id | Out-Null
        Remove-Item $arquivo -Force -ErrorAction SilentlyContinue
        Write-Host "$nome parado (PID $($proc.Id))"
    } else {
        Write-Host "${nome}: registro removido: nao foi possivel confirmar que o processo registrado e o que estes scripts iniciaram (encerrado, PID reaproveitado ou registro antigo); nada foi encerrado"
    }
}
