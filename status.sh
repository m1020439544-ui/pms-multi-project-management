#!/usr/bin/env sh
DIR=$(cd "$(dirname "$0")" && pwd)
cd "$DIR"
if [ -f data/pms.pid ] && kill -0 "$(cat data/pms.pid)" 2>/dev/null; then
  echo "运行中（PID $(cat data/pms.pid)）"
else
  echo "未运行"
fi
