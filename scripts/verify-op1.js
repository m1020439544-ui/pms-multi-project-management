const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    document.querySelector('input[name="username"]').value = 'op1';
    document.querySelector('input[name="password"]').value = 'op123';
  });
  await page.click('button[type="submit"]');
  await page.waitForSelector('.topnav');
  await page.evaluate(() => { location.hash = '#/projects'; });
  await new Promise(r => setTimeout(r, 900));
  const d = await page.evaluate(() => ({
    hasNew: !!document.querySelector('[data-action="new-project"]'),
    hasEdit: !!document.querySelector('[data-action^="edit-project:"]'),
    hasNoFundButton: !document.querySelector('[data-action="new-fund"]'),
    text: document.body.innerText.slice(0, 200)
  }));
  console.log(JSON.stringify(d, null, 2));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
