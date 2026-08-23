const puppeteer = require('puppeteer-core');
const path = require('node:path');
const fs = require('node:fs');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('console: ' + msg.text());
  });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('requestfailed', (req) => errors.push('requestfailed: ' + req.url() + ' ' + req.failure()?.errorText));

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  // 登录表单已预填演示账号
  await page.click('button[type="submit"]');
  await page.waitForSelector('.topnav', { timeout: 10000 });
  await page.waitForFunction(() => location.hash === '#/overview', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(OUT, '01-overview.png'), fullPage: true });

  const routes = [
    ['02-projects', '#/projects'],
    ['03-project-detail', '#/project-detail'],
    ['04-project-stages', '#/project-stages'],
    ['05-documents', '#/documents'],
    ['06-reminders', '#/reminders'],
    ['07-ai-config', '#/ai-config'],
    ['08-settings', '#/settings']
  ];

  for (const [name, hash] of routes) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await new Promise(r => setTimeout(r, 900));
    await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });
  }

  // 交互验证：新建项目弹窗
  await page.evaluate(() => { location.hash = '#/projects'; });
  await new Promise(r => setTimeout(r, 700));
  await page.click('[data-action="new-project"]');
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(OUT, '09-new-project-modal.png'), fullPage: false });

  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
