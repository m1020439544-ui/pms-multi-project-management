#!/usr/bin/env sh
DIR=$(cd "$(dirname "$0")" && pwd)
cd "$DIR"
if [ -f data/pms.pid ]; then
  PID=$(cat data/pms.pid)
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "已停止系统（PID $PID）"
  else
    echo "进程不存在"
  fi
  rm -f data/pms.pid
else
  echo "未找到后台进程记录"
fi
