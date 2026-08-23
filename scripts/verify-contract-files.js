const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await page.click('button[type="submit"]');
  await page.waitForSelector('.topnav');
  await page.evaluate(() => { location.hash = '#/contracts'; });
  await new Promise(r => setTimeout(r, 900));
  const btn = await page.evaluate(() => !!document.querySelector('[data-action^="contract-files:"]'));
  await page.click('[data-action^="contract-files:"]');
  await new Promise(r => setTimeout(r, 800));
  const d = await page.evaluate(() => ({
    text: document.body.innerText.slice(-900),
    hasAnalyze: !!document.querySelector('[data-action="analyze-contract"]'),
    hasUpload: !!document.querySelector('#contract-file-input'),
    hasLog: !!document.querySelector('#contract-files-log')
  }));
  console.log(JSON.stringify({ btn, d }, null, 2));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
