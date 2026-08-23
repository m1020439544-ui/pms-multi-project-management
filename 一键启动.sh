#!/usr/bin/env sh
# 智项目 · 多项目管理系统：一键启动（自动安装依赖 + 后台运行）
DIR=$(cd "$(dirname "$0")" && pwd)
cd "$DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未检测到 Node.js，请先安装 Node.js 22.5 及以上版本。"
  echo "下载地址：https://nodejs.org/（HarmonyOS 开发者环境请选择 linux arm64/x64 版本）"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "首次运行，正在安装依赖..."
  npm install --omit=dev --no-audit --no-fund
fi

mkdir -p data/uploads

if [ -f data/pms.pid ] && kill -0 "$(cat data/pms.pid)" 2>/dev/null; then
  echo "系统已在后台运行（PID $(cat data/pms.pid)）"
else
  nohup node server/index.js > data/pms.log 2>&1 &
  echo $! > data/pms.pid
  sleep 1
  echo "系统已后台启动（PID $(cat data/pms.pid)）"
fi

echo ""
echo "============================================"
echo " 访问地址：http://localhost:3000"
echo " 局域网访问：http://$(hostname -I 2>/dev/null | awk '{print $1}'):3000"
echo " 停止服务：./stop.sh"
echo " 运行日志：data/pms.log"
echo "============================================"

if command -v xdg-open >/dev/null 2>&1; then
  (xdg-open "http://localhost:3000" >/dev/null 2>&1 &)
fi
