const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.click('button[type="submit"]');
  await page.waitForSelector('.topnav');

  // 项目页显示方式
  await page.evaluate(() => { location.hash = '#/projects'; });
  await new Promise(r => setTimeout(r, 900));
  const projects = await page.evaluate(() => ({
    toggle: !!document.querySelector('[data-action="toggle-project-view"]'),
    tableMode: !!document.querySelector('[data-action="toggle-project-view"]')
  }));

  // 选择项目后查看项目信息新字段
  await page.click('[data-action="select-project"]');
  await new Promise(r => setTimeout(r, 1200));
  const detail = await page.evaluate(() => ({
    text: document.body.innerText,
    hasProjectNo: document.body.innerText.includes('项目编号'),
    hasForward: document.body.innerText.includes('前向合同编码'),
    hasBackward: document.body.innerText.includes('后向合同编码'),
    hasGroup: document.body.innerText.includes('集团商机编码'),
    hasOurUnit: document.body.innerText.includes('我方单位')
  }));

  // 设置页用户与导出导入
  await page.evaluate(() => { location.hash = '#/settings'; });
  await new Promise(r => setTimeout(r, 900));
  const settings = await page.evaluate(() => ({
    text: document.body.innerText.slice(0, 1200),
    hasUser: document.body.innerText.includes('用户与权限配置'),
    hasExport: !!document.querySelector('[data-action="export-menu"]'),
    hasTemplate: !!document.querySelector('[data-action="menu-template"]'),
    hasImport: !!document.querySelector('[data-action="import-menu"]'),
    hasNewUser: !!document.querySelector('[data-action="new-user"]')
  }));

  console.log(JSON.stringify({ projects, detail, settings }, null, 2));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
