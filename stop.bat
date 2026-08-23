@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Test-Path 'data\pms.pid') { $pid2 = Get-Content 'data\pms.pid' -ErrorAction SilentlyContinue; if ($pid2 -and (Get-Process -Id $pid2 -ErrorAction SilentlyContinue)) { Stop-Process -Id $pid2 -Force; Write-Host ('已停止系统 PID ' + $pid2) } else { Write-Host '进程不存在' }; Remove-Item 'data\pms.pid' -ErrorAction SilentlyContinue } else { Write-Host '未找到后台进程记录' }"
pause
