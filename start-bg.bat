@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Test-Path 'data\pms.pid') { $pid2 = Get-Content 'data\pms.pid' -ErrorAction SilentlyContinue; if ($pid2 -and (Get-Process -Id $pid2 -ErrorAction SilentlyContinue)) { Write-Host ('系统已在后台运行 PID ' + $pid2); exit 0 } }; if (-not (Test-Path 'data\uploads')) { New-Item -ItemType Directory -Path 'data\uploads' -Force | Out-Null }; $proc = Start-Process node -ArgumentList 'server\index.js' -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru -RedirectStandardOutput 'data\pms.log' -RedirectStandardError 'data\pms.err.log'; $proc.Id | Out-File 'data\pms.pid' -Encoding ascii; Write-Host ('系统已后台启动 PID ' + $proc.Id); Write-Host '访问地址：http://localhost:3000'"
pause
