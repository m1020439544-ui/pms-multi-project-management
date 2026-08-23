const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist', 'pms-v1.0.3');
const zip = path.join(root, 'dist', '智项目管理系统-V1.0.3交付包.zip');

fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const item of ['server', 'public', 'docs', 'launcher', 'package.json', 'package-lock.json', 'README.md', 'install.bat', 'start.bat', 'start-bg.bat', 'stop.bat', 'install.sh', 'start.sh', 'start-bg.sh', 'stop.sh', 'status.sh', '一键启动.sh', '启动界面.bat', '启动界面.sh', '鸿蒙浏览器访问.html', 'VERSION', '.gitignore']) {
  const src = path.join(root, item);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(dist, item), { recursive: true });
}
fs.mkdirSync(path.join(dist, 'data', 'uploads'), { recursive: true });

console.log('installing production dependencies (omit dev)...');
execSync('npm install --omit=dev --no-audit --no-fund', { cwd: dist, stdio: 'inherit', shell: true });

console.log('compressing...');
execSync(`tar -a -cf "${zip}" -C "${path.dirname(dist)}" pms-v1.0.3`, { shell: true });
const stat = fs.statSync(zip);
console.log('package built:', zip, (stat.size / 1024 / 1024).toFixed(1), 'MB');
