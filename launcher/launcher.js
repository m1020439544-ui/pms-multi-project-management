const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const PMS_PORT = Number(process.env.PORT || 3000);
const LAUNCHER_PORT = Number(process.env.LAUNCHER_PORT || 8899);
const PID_FILE = path.join(DATA, 'pms.pid');
const PORT_FILE = path.join(DATA, 'pms.port');
const LOG_FILE = path.join(DATA, 'pms.log');
const INSTALL_LOG = path.join(DATA, 'install.log');
const APP_VERSION = (() => {
  try { return fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim().replace(/^pms-/, ''); }
  catch (e) { return '1.0.2'; }
})();

fs.mkdirSync(path.join(DATA, 'uploads'), { recursive: true });

function readPid() {
  try { return Number(fs.readFileSync(PID_FILE, 'utf8').trim()) || null; } catch (e) { return null; }
}

function isRunning(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return false; }
}

function currentPmsPort() {
  try { return Number(fs.readFileSync(PORT_FILE, 'utf8').trim()) || PMS_PORT; } catch (e) { return PMS_PORT; }
}

function tailFile(file, lines = 200) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    return text.split(/\r?\n/).slice(-lines).join('\n');
  } catch (e) { return ''; }
}

function lanIps() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const info of ifs[name] || []) {
      if (info.family === 'IPv4' && !info.internal) out.push(info.address);
    }
  }
  return out;
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];
  if (req.method === 'GET' && url === '/api/status') {
    const pid = readPid();
    return json(res, 200, {
      version: APP_VERSION,
      running: isRunning(pid),
      pid: pid || null,
      pmsPort: currentPmsPort(),
      launcherPort: LAUNCHER_PORT,
      nodeVersion: process.version,
      platform: `${os.platform()} ${os.arch()}`,
      lanIps: lanIps()
    });
  }
  if (req.method === 'POST' && url === '/api/install') {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    try {
      const r = spawnSync(npmCmd, ['install', '--omit=dev', '--no-audit', '--no-fund'], {
        cwd: ROOT,
        shell: process.platform === 'win32',
        encoding: 'utf8',
        timeout: 10 * 60 * 1000,
        env: process.env
      });
      fs.writeFileSync(INSTALL_LOG, `${r.stdout || ''}\n${r.stderr || ''}`);
      return json(res, r.status === 0 ? 200 : 500, {
        ok: r.status === 0,
        message: r.status === 0 ? '依赖安装完成' : '依赖安装失败，请查看日志',
        output: tailFile(INSTALL_LOG, 40)
      });
    } catch (e) {
      return json(res, 500, { ok: false, message: '依赖安装失败：' + e.message });
    }
  }
  if (req.method === 'POST' && url === '/api/start') {
    const pid = readPid();
    if (isRunning(pid)) {
      return json(res, 200, { ok: true, pid, message: '系统已在运行', started: false });
    }
    const outFd = fs.openSync(LOG_FILE, 'a');
    const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT,
      detached: true,
      stdio: ['ignore', outFd, outFd],
      env: Object.assign({}, process.env, { PORT: String(PMS_PORT) })
    });
    child.unref();
    fs.writeFileSync(PID_FILE, String(child.pid));
    return json(res, 200, { ok: true, pid: child.pid, message: '系统已后台启动', started: true });
  }
  if (req.method === 'POST' && url === '/api/stop') {
    const pid = readPid();
    if (isRunning(pid)) {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        try { process.kill(pid, 'SIGTERM'); } catch (e) {}
      }
    }
    try { fs.unlinkSync(PID_FILE); } catch (e) {}
    return json(res, 200, { ok: true, message: '停止指令已发送' });
  }
  if (req.method === 'GET' && url === '/api/log') {
    return json(res, 200, { log: tailFile(LOG_FILE, 300) });
  }
  if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'));
  }
  return json(res, 404, { error: 'not found' });
});

server.listen(LAUNCHER_PORT, () => {
  console.log(`PMS 启动界面已就绪：http://localhost:${LAUNCHER_PORT}`);
});
