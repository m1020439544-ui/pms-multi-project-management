@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process node -ArgumentList 'launcher\launcher.js' -WorkingDirectory (Get-Location) -WindowStyle Hidden"
timeout /t 1 /nobreak >nul
start http://localhost:8899
