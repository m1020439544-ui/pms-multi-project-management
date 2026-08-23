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
  await page.evaluate(() => { location.hash = '#/projects'; });
  await new Promise(r => setTimeout(r, 800));
  await page.click('[data-action="select-project"]');
  await new Promise(r => setTimeout(r, 1200));

  const out = [];
  for (const [hash, label] of [['#/project-detail','detail'],['#/project-stages','stages'],['#/documents','docs']]) {
    await page.evaluate(h => { location.hash = h; }, hash);
    await new Promise(r => setTimeout(r, 900));
    const d = await page.evaluate(() => ({
      hash: location.hash,
      text: document.body.innerText.slice(0, 400),
      nodes: document.querySelectorAll('.tree .node').length,
      tabs: document.querySelectorAll('.tab').length,
      steps: document.querySelectorAll('.step').length,
      tables: document.querySelectorAll('.table').length
    }));
    out.push(d);
  }
  console.log(JSON.stringify(out, null, 2));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
