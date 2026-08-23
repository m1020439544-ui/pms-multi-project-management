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

  const checks = [
    ['#/contracts', () => ({ tabs: document.querySelectorAll('.tab').length, rows: document.querySelectorAll('.table tbody tr').length, hasAdd: !!document.querySelector('[data-action="new-back-contract"]') })],
    ['#/templates', () => ({ tabs: document.querySelectorAll('.tab').length, rows: document.querySelectorAll('.table tbody tr').length, hasAdd: !!document.querySelector('[data-action="new-template"]') })],
    ['#/pmo', () => ({ statCards: document.querySelectorAll('.stat-card').length, hasMember: document.body.innerText.includes('成员') })],
    ['#/kb', () => ({ nodes: document.querySelectorAll('#kb-tree .node').length, hasSearch: !!document.querySelector('#kb-search'), hasAsk: !!document.querySelector('#kb-question') })]
  ];
  const out = [];
  for (const [hash, fn] of checks) {
    await page.evaluate(h => { location.hash = h; }, hash);
    await new Promise(r => setTimeout(r, 1000));
    out.push({ hash, data: await page.evaluate(fn), text: await page.evaluate(() => document.body.innerText.slice(0, 160)) });
  }
  const navKeys = await page.evaluate(() => Array.from(document.querySelectorAll('.nav-item')).map(a => a.textContent.trim()));
  console.log(JSON.stringify({ navKeys, out }, null, 2));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
