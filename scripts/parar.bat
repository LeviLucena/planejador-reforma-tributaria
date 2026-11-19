@echo off
rem Para o servidor do app e os motores (somente processos registrados em scripts/.pids).
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-app.ps1" -Parar
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-motores.ps1" -Parar
echo.
echo Encerrado.
exit /b 0
