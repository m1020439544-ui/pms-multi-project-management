#!/usr/bin/env sh
set -e
echo "============================================"
echo " 智项目 · 多项目管理系统 V1.0 安装"
echo "============================================"
if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未检测到 Node.js，请安装 Node.js 22.5 或更高版本。"
  exit 1
fi
echo "当前 Node.js 版本: $(node -v)"
echo "正在安装依赖..."
npm install --omit=dev
mkdir -p data/uploads
echo "安装完成！运行 ./start.sh 启动系统。"
