const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    document.querySelector('input[name="username"]').value = 'viewer';
    document.querySelector('input[name="password"]').value = 'pmo2026';
  });
  await page.click('button[type="submit"]');
  await page.waitForSelector('.topnav');
  await new Promise(r => setTimeout(r, 500));
  const nav = await page.evaluate(() => Array.from(document.querySelectorAll('.nav-item')).map(a => a.textContent.trim()));
  console.log(JSON.stringify(nav, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
