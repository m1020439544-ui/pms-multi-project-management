#!/usr/bin/env sh
DIR=$(cd "$(dirname "$0")" && pwd)
cd "$DIR"
mkdir -p data/uploads
if [ -f data/launcher.pid ] && kill -0 "$(cat data/launcher.pid)" 2>/dev/null; then
  echo "启动界面已在运行"
else
  nohup node launcher/launcher.js > data/launcher.log 2>&1 &
  echo $! > data/launcher.pid
  sleep 1
fi
if command -v xdg-open >/dev/null 2>&1; then
  (xdg-open "http://localhost:8899" >/dev/null 2>&1 &)
else
  echo "请在浏览器打开：http://localhost:8899"
fi
