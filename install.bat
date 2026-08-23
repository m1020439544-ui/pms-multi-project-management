@echo off
chcp 65001 >nul
echo ============================================
echo  智项目 · 多项目管理系统 V1.0 安装
echo ============================================
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请安装 Node.js 22.5 或更高版本。
  echo Windows x64: https://nodejs.org/
  echo Windows ARM: 请选择 Windows ARM64 版本安装包。
  pause
  exit /b 1
)
for /f "tokens=1 delims=v" %%v in ('node -v') do set NODEV=%%v
echo 当前 Node.js 版本: %NODEV%
echo 正在安装依赖...
call npm install --omit=dev
if errorlevel 1 (
  echo [错误] 依赖安装失败，请检查网络后重试。
  pause
  exit /b 1
)
if not exist data mkdir data
if not exist data\uploads mkdir data\uploads
echo 安装完成！双击 start.bat 启动系统。
pause
