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
  await page.waitForSelector('.topnav', { timeout: 10000 });

  const checks = [
    ['#/overview', () => ({ navItems: document.querySelectorAll('.nav-item').length, statCards: document.querySelectorAll('.stat-card').length, ganttRows: document.querySelectorAll('.gantt-row').length, tableRows: document.querySelectorAll('.table tbody tr').length })],
    ['#/projects', () => ({ projectCards: document.querySelectorAll('.project-card').length, newBtn: !!document.querySelector('[data-action="new-project"]') })],
    ['#/project-detail', () => ({ tabs: document.querySelectorAll('.tab').length, banner: !!document.querySelector('.banner, .card') })],
    ['#/project-stages', () => ({ steps: document.querySelectorAll('.step').length, aiBtn: !!document.querySelector('[data-action="ai-extract"]') })],
    ['#/documents', () => ({ treeNodes: document.querySelectorAll('.tree .node').length, aiTemplates: document.querySelectorAll('[data-action="ai-doc-template"]').length })],
    ['#/reminders', () => ({ groupCards: document.querySelectorAll('.grid > .card').length, ruleRows: document.querySelectorAll('.table tbody tr').length })],
    ['#/ai-config', () => ({ modelCards: document.querySelectorAll('.grid > .card').length, capRows: document.querySelectorAll('.table tbody tr').length })],
    ['#/settings', () => ({ menuRows: document.querySelectorAll('.table tbody tr').length, addBtn: !!document.querySelector('[data-action="new-menu-item"]') })]
  ];

  const out = [];
  for (const [hash, fn] of checks) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await new Promise(r => setTimeout(r, 900));
    const data = await page.evaluate(fn);
    out.push({ hash, data, bodyText: await page.evaluate(() => document.body.innerText.slice(0, 120)) });
  }
  console.log(JSON.stringify(out, null, 2));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
