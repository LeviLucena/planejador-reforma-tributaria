@echo off
rem Launcher do Planejador da Reforma Tributaria. Aceita -Reconstruir.
rem Mensagens sem acento neste arquivo; o PowerShell (UTF-8 com BOM) imprime os textos acentuados.
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar.ps1" %*
set RC=%ERRORLEVEL%
if not "%RC%"=="0" (
  echo.
  echo O launcher terminou com erro. Leia a mensagem acima.
  if not "%NAO_ABRIR_NAVEGADOR%"=="1" pause
)
exit /b %RC%
