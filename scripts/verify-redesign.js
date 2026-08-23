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

  // PMO 各 tab
  await page.evaluate(() => { location.hash = '#/pmo'; });
  await new Promise(r => setTimeout(r, 900));
  const pmo = {};
  for (const tab of ['eight', 'milestones', 'checks', 'audits', 'changes', 'members', 'overview']) {
    await page.click(`[data-action="pmo-tab"][data-tab="${tab}"]`);
    await new Promise(r => setTimeout(r, 700));
    pmo[tab] = await page.evaluate(() => document.getElementById('pmo-body').innerText.slice(0, 90));
  }

  // 项目三阶段流程（选择 p001）
  await page.evaluate(() => { localStorage.setItem('pms_current_project_v1', 'p001'); location.hash = '#/projects'; });
  await new Promise(r => setTimeout(r, 800));
  await page.click('[data-action="select-project"]');
  await new Promise(r => setTimeout(r, 900));
  await page.evaluate(() => { location.hash = '#/project-stages'; });
  await new Promise(r => setTimeout(r, 1000));
  const stages = await page.evaluate(() => ({
    chips: document.querySelectorAll('.tag').length,
    text: document.body.innerText.slice(0, 600),
    qaRows: Array.from(document.querySelectorAll('.table tbody tr')).length
  }));

  console.log(JSON.stringify({ pmo, stages }, null, 2));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
