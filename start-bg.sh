#!/usr/bin/env sh
DIR=$(cd "$(dirname "$0")" && pwd)
cd "$DIR"
mkdir -p data/uploads
if [ -f data/pms.pid ] && kill -0 "$(cat data/pms.pid)" 2>/dev/null; then
  echo "系统已在后台运行（PID $(cat data/pms.pid)）"
  exit 0
fi
nohup node server/index.js > data/pms.log 2>&1 &
echo $! > data/pms.pid
sleep 1
echo "系统已后台启动（PID $(cat data/pms.pid)），日志：data/pms.log，访问：http://localhost:3000"
