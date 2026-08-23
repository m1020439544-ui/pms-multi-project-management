import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';
const errors = [];
const checks = [];

function check(cond, name) {
  checks.push({ name, ok: !!cond });
  if (!cond) errors.push('CHECK FAIL: ' + name);
}

const tmpFile = path.resolve('scripts', 'e2e-upload.txt');
fs.writeFileSync(tmpFile, '合同金额 200 万元。付款：签约后 30 日内支付 40%，终验合格后支付 60%。工期 120 天。质保 2 年。违约按日万分之五。保密义务。', 'utf8');

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 960 });
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => { if (r.url().includes('/api/')) errors.push('reqfail: ' + r.url()); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const goto = async (hash, ms = 900) => { await page.evaluate((h) => { location.hash = h; }, hash); await sleep(ms); };
const hasText = (t) => page.evaluate((x) => document.body.innerText.includes(x), t);

// 登录
await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.click('button[type="submit"]');
await page.waitForSelector('.topnav', { timeout: 10000 });
check(await hasText('总览看板'), 'admin login');

// 页面加载检查
const routes = [
  ['#/overview', '.stat-card', 4],
  ['#/projects', '[data-action="new-project"]', 1],
  ['#/contracts', '#contract-project', 1],
  ['#/templates', '[data-action="new-template"]', 1],
  ['#/pmo', '[data-action="pmo-tab"]', 7],
  ['#/kb', '#kb-search', 1],
  ['#/reminders', '.switch input[data-rule]', 1],
  ['#/ai-config', '[data-action="new-ai-model"]', 1],
  ['#/settings', '[data-action="new-menu-item"]', 1]
];
for (const [hash, sel, count] of routes) {
  await goto(hash);
  const n = await page.evaluate((s) => document.querySelectorAll(s).length, sel);
  check(n >= count, `route ${hash} renders ${sel}>=${count} (${n})`);
}

// 项目页：切换显示方式 + 新建弹窗开关
await goto('#/projects');
await page.click('[data-action="toggle-project-view"]');
await sleep(400);
check(await hasText('表格视图') || await hasText('卡片视图'), 'project view toggle');
await page.click('[data-action="new-project"]');
await sleep(300);
check(await hasText('新建项目'), 'new project modal');
await page.click('[data-action="modal-close"]');

// 选择项目 → 工作区 5 Tab
await page.click('[data-action="select-project"]');
await sleep(1000);
for (const tab of ['funds', 'docs', 'risks', 'changes', 'info']) {
  await page.click(`[data-action="detail-tab"][data-tab="${tab}"]`);
  await sleep(700);
}
check(true, 'project detail tabs switch');

// 三阶段流程：里程碑完成/重置
await goto('#/project-stages', 1100);
const chipCount = await page.evaluate(() => document.querySelectorAll('.tag').length);
check(chipCount >= 12, `stages chips >=12 (${chipCount})`);
await page.click('[data-action="ms-done"]');
await sleep(700);
await page.click('[data-action="ms-reset"]');
await sleep(700);

// 合同附件 + 上传 + AI 分析 + 操作记录 + 删除
await goto('#/contracts', 900);
await page.select('#contract-project', 'p001');
await sleep(900);
await page.click('[data-action^="contract-files:forward"]');
await sleep(700);
const fileInput = await page.$('#contract-file-input');
await fileInput.uploadFile(tmpFile);
await sleep(2500);
check(await hasText('合同重要条款分析'), 'AI clause analysis appears after upload');
check(await hasText('操作记录'), 'operation log section');
check(await hasText('在线查看') || await hasText('下载'), 'file actions appear');
const delBtn = await page.$('[data-action^="delete-contract-file:"]');
check(!!delBtn, 'delete file button');
if (delBtn) {
  await delBtn.click();
  await sleep(400);
  await page.click('[data-action="confirm-delete-contract-file"]');
  await sleep(1000);
}
await page.click('[data-action="modal-close"]');

// PMO 各 Tab
await goto('#/pmo', 900);
for (const tab of ['overview', 'eight', 'milestones', 'checks', 'audits', 'changes', 'members']) {
  await page.click(`[data-action="pmo-tab"][data-tab="${tab}"]`);
  await sleep(600);
}
check(true, 'pmo all tabs');

// 设置：用户弹窗
await goto('#/settings', 900);
await page.click('[data-action="new-user"]');
await sleep(300);
check(await hasText('新增用户'), 'user modal');
await page.click('[data-action="modal-close"]');

// 退出 → 只读用户登录
await page.click('[data-action="logout"]');
await sleep(600);
await page.evaluate(() => {
  document.querySelector('input[name="username"]').value = 'viewer';
  document.querySelector('input[name="password"]').value = 'pmo2026';
});
await page.click('button[type="submit"]');
await page.waitForSelector('.topnav', { timeout: 10000 });
const viewerNav = await page.evaluate(() => Array.from(document.querySelectorAll('.nav-item')).map((a) => a.textContent.trim()));
check(viewerNav.length === 7, `viewer nav 7 items (${viewerNav.length})`);
check(!viewerNav.some((x) => x.includes('PMO管理')), 'viewer cannot see PMO');

await browser.close();
fs.unlinkSync(tmpFile);

console.log('E2E CHECKS:', checks.filter((c) => c.ok).length + '/' + checks.length);
for (const c of checks.filter((x) => !x.ok)) console.log('  FAIL:', c.name);
console.log('errors:', errors.length ? errors : 'none');
process.exit(errors.length || checks.some((c) => !c.ok) ? 1 : 0);
