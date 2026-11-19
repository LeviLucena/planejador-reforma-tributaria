@echo off
rem Para somente os dois motores oficiais (o servidor do app continua no ar).
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-motores.ps1" -Parar
exit /b 0
