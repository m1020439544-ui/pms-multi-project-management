const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.click('button[type="submit"]');
  await page.waitForSelector('.topnav');
  await page.evaluate(() => { localStorage.setItem('pms_current_project_v1','p001'); location.hash='#/project-detail'; });
  await new Promise(r => setTimeout(r, 1000));
  await page.click('[data-action="detail-tab"][data-tab="funds"]');
  await new Promise(r => setTimeout(r, 1200));
  const d = await page.evaluate(() => ({
    text: document.body.innerText.slice(0, 700),
    tables: document.querySelectorAll('.table').length,
    rows: document.querySelectorAll('.table tbody tr').length
  }));
  console.log(JSON.stringify(d, null, 2));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
