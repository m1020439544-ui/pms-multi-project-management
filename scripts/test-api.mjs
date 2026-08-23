import ExcelJS from 'exceljs';

const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
const failures = [];

function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; failures.push(name); console.log('  FAIL:', name); }
}

async function call(path, { method = 'GET', token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (form) payload = form;
  const res = await fetch(BASE + path, { method, headers, body: payload });
  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) { try { data = await res.json(); } catch (e) { data = null; } }
  else data = await res.arrayBuffer();
  return { status: res.status, data };
}

async function login(username, password) {
  const r = await call('/api/auth/login', { method: 'POST', body: { username, password } });
  ok(r.status === 200, `login ${username}`);
  return r.data.token;
}

const admin = await login('pmo', 'pmo2026');
const viewer = await login('viewer', 'pmo2026');

// menu
let r = await call('/api/menu', { token: admin });
ok(r.status === 200 && r.data.length === 10, 'admin menu 10 top');
r = await call('/api/menu', { token: viewer });
ok(r.status === 200 && r.data.length === 7, 'viewer menu 7 top');

// projects
r = await call('/api/projects', { token: admin });
ok(r.status === 200 && r.data.length === 8, 'projects list');
const testProject = {
  name: '全链路测试项目', project_no: 'XM-TEST-999', group_opportunity_code: 'SJ-TEST-999',
  amount: 260, paid: 0, risk: 'green', stage: '启动', type: '测试', customer_name: '测试客户',
  income_type: '非周期', net_or_full: '全额', milestone: '开工', next_milestone: '到货', next_milestone_date: '2027-01-01',
  progress: '测试进度', delay_extension: '无', forward_contract_code: 'FW-TEST-999', forward_contract_name: '测试前向合同',
  forward_contract_amount: 260, backward_contract_code: 'HW-TEST-999', backward_contract_name: '测试后向合同', backward_unit_name: '测试供应商'
};
r = await call('/api/projects', { method: 'POST', token: admin, body: testProject });
ok(r.status === 200 && r.data.project_no === 'XM-TEST-999', 'create project');
const pid = r.data.id;

r = await call('/api/projects', { method: 'POST', token: viewer, body: { name: '越权项目' } });
ok(r.status === 403, 'viewer cannot create project');

r = await call(`/api/projects/${pid}`, { method: 'PUT', token: admin, body: { ...testProject, milestone: '到货' } });
ok(r.status === 200 && r.data.milestone === '到货', 'update project');

// milestones
r = await call(`/api/projects/${pid}/milestones`, { token: admin });
ok(r.status === 200 && r.data.length === 12, 'milestones seeded 12');
const mid = r.data[0].id;
r = await call(`/api/milestones/${mid}`, { method: 'PUT', token: admin, body: { status: 'done', done_date: '2026-08-23' } });
ok(r.status === 200 && r.data.status === 'done', 'milestone done');
r = await call(`/api/milestones/${mid}`, { method: 'PUT', token: admin, body: { status: 'pending', done_date: null } });
ok(r.status === 200 && r.data.status === 'pending', 'milestone reset');

// funds
r = await call(`/api/projects/${pid}/fund-in`, { method: 'POST', token: admin, body: { name: '测试回款', amount: 100, plan_date: '2027-01-01' } });
ok(r.status === 200 && r.data.id, 'create fund-in');
const fid = r.data.id;
r = await call(`/api/fund-in/${fid}`, { method: 'PUT', token: admin, body: { amount: 120 } });
ok(r.status === 200 && r.data.amount === 120, 'update fund-in');
r = await call(`/api/fund-in/${fid}`, { method: 'DELETE', token: admin });
ok(r.status === 200, 'delete fund-in');

// contracts
r = await call(`/api/projects/${pid}/sub-contracts`, { method: 'POST', token: admin, body: { name: '测试后向合同', supplier: '供应商A', signable: 100, signed: 60, paid: 30 } });
ok(r.status === 200 && r.data.id, 'create sub-contract');
const scid = r.data.id;
r = await call(`/api/sub-contracts/${scid}`, { method: 'PUT', token: admin, body: { paid: 40 } });
ok(r.status === 200 && r.data.paid === 40, 'update sub-contract');
r = await call(`/api/sub-contracts/${scid}`, { method: 'DELETE', token: admin });
ok(r.status === 200, 'delete sub-contract');

r = await call('/api/contracts', { token: admin });
ok(r.status === 200 && r.data.length >= 11, 'contracts list >=11');
r = await call('/api/contracts?projectId=p001', { token: admin });
ok(r.status === 200 && r.data.length === 3, 'contracts single project filter');
r = await call('/api/contracts/plans', { token: admin });
ok(r.status === 200, 'contract plans');

// contract file upload + AI analyze + logs
const txt = new Blob(['本项目合同金额 260 万元。付款：签约后支付 30%，终验后支付 70%。工期 90 天。质保 1 年。违约按日万分之五。'], { type: 'text/plain' });
let fd = new FormData();
fd.append('file', txt, '合同测试.txt');
r = await call(`/api/contracts/forward/${pid}/files`, { method: 'POST', token: admin, form: fd });
ok(r.status === 200 && r.data.id, 'upload contract file');
const cfid = r.data.id;
r = await call(`/api/contracts/forward/${pid}/files`, { token: admin });
ok(r.status === 200 && r.data.length === 1, 'list contract files');
r = await call(`/api/contracts/forward/${pid}/analyze`, { method: 'POST', token: admin, body: {} });
ok(r.status === 200 && Array.isArray(r.data.clauses) && r.data.clauses.length > 0, 'AI analyze clauses');
r = await call(`/api/contracts/forward/${pid}/analysis`, { token: admin });
ok(r.status === 200 && r.data && Array.isArray(r.data.clauses), 'get analysis');
r = await call(`/api/contract-files/${cfid}/view`, { token: admin });
ok(r.status === 200, 'contract file inline view');
r = await call(`/api/contract-files/${cfid}/download`, { token: admin });
ok(r.status === 200, 'contract file download');
r = await call(`/api/contracts/forward/${pid}/logs`, { token: admin });
ok(r.status === 200 && r.data.length >= 3, 'contract operation logs');
r = await call(`/api/contract-files/${cfid}`, { method: 'DELETE', token: admin });
ok(r.status === 200, 'delete contract file');

// PMO tables & records
r = await call('/api/pmo/summary', { token: admin });
ok(r.status === 200 && r.data.eightTables && r.data.milestones.length > 0, 'pmo summary');
r = await call('/api/pmo/checks', { method: 'POST', token: admin, body: { project_id: pid, category: 'AI质检', item: '测试检查项', result: '通过' } });
ok(r.status === 200 && r.data.id, 'create check');
const chkId = r.data.id;
r = await call(`/api/pmo/checks/${chkId}`, { method: 'PUT', token: admin, body: { result: '不通过' } });
ok(r.status === 200 && r.data.result === '不通过', 'update check');
r = await call(`/api/pmo/checks/${chkId}`, { method: 'DELETE', token: admin });
ok(r.status === 200, 'delete check');
r = await call('/api/pmo/audits', { method: 'POST', token: admin, body: { project_id: pid, direction: 'forward', status: '待送审' } });
ok(r.status === 200 && r.data.id, 'create audit');
const audId = r.data.id;
r = await call(`/api/pmo/audits/${audId}`, { method: 'DELETE', token: admin });
ok(r.status === 200, 'delete audit');
r = await call('/api/pmo/changes', { method: 'POST', token: admin, body: { project_id: pid, change_type: '方案变更', before_value: 'A', after_value: 'B' } });
ok(r.status === 200 && r.data.id, 'create change');
r = await call(`/api/pmo/changes/${r.data.id}`, { method: 'DELETE', token: admin });
ok(r.status === 200, 'delete change');

// folders
r = await call(`/api/projects/${pid}/folders`, { token: admin });
ok(r.status === 200 && r.data.length === 3, 'standard folders 3 top');
r = await call(`/api/projects/${pid}/folders`, { method: 'POST', token: admin, body: { name: '测试目录' } });
ok(r.status === 200 && r.data.id, 'create folder');
const folderId = r.data.id;
r = await call(`/api/folders/${folderId}`, { method: 'PUT', token: admin, body: { name: '测试目录2' } });
ok(r.status === 200 && r.data.name === '测试目录2', 'rename folder');
r = await call(`/api/folders/${folderId}`, { method: 'DELETE', token: admin });
ok(r.status === 200, 'delete folder');

// KB
r = await call('/api/kb/articles', { method: 'POST', token: admin, body: { title: '测试知识', content: '内容' } });
ok(r.status === 200 && r.data.id, 'create kb article');
r = await call(`/api/kb/articles/${r.data.id}`, { method: 'DELETE', token: admin });
ok(r.status === 200, 'delete kb article');

// templates
r = await call('/api/templates', { method: 'POST', token: admin, body: { type: 'doc', name: '测试模板' } });
ok(r.status === 200 && r.data.id, 'create template');
r = await call(`/api/templates/${r.data.id}`, { method: 'PUT', token: admin, body: { name: '测试模板2' } });
ok(r.status === 200 && r.data.name === '测试模板2', 'update template');
r = await call(`/api/templates/${r.data.id}`, { method: 'DELETE', token: admin });
ok(r.status === 200, 'delete template');

// menu export / template / import (incremental)
r = await call('/api/menu/export', { token: admin });
ok(r.status === 200 && r.data.items.length >= 10, 'menu export');
r = await call('/api/menu/template', { token: admin });
ok(r.status === 200 && r.data.items.length >= 10, 'menu template');
r = await call('/api/menu/import', { method: 'POST', token: admin, body: { items: [{ key: 'overview', name: '总览', display: '总览', href: '#/overview', sort_order: 1, visible: true, roles: ['admin', 'viewer'], parent_key: '' }] } });
ok(r.status === 200 && r.data.updated >= 1, 'menu import incremental');

// project view mode
r = await call('/api/settings/project-view', { method: 'PUT', token: admin, body: { view: 'table' } });
ok(r.status === 200 && r.data.view === 'table', 'project view mode table');
r = await call('/api/settings/project-view', { method: 'PUT', token: admin, body: { view: 'card' } });
ok(r.status === 200 && r.data.view === 'card', 'project view mode card');

// project import
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('项目导入模板');
ws.addRow(['项目名称', '项目编号', '集团商机编码', '立项完成时间', '项目金额(万)', '开工时间', '预计终验时间', '签约归档时间', '我方单位', '客户名称', '对方单位', '项目类型', '阶段', '风险', '签约日期', '截止日期', '项目经理', '备注', '前向合同编码', '前向合同名称', '前向签约金额(万)', '前向签约时间', '后向合同编码', '后向合同名称', '后向单位名称', '后向签约金额(万)', '后向签约时间']);
ws.addRow(['导入测试项目', 'XM-IMP-999', 'SJ-IMP-999', '2026-08-01', 100, '2026-08-05', '2027-01-31', '2027-02-10', '我方单位', '导入客户', '导入客户', '测试', '启动', 'green', '2026-08-01', '2027-01-31', '陈志远', '', 'FW-IMP-999', '导入前向合同', 100, '2026-08-01', 'HW-IMP-999', '导入后向合同', '导入供应商', 60, '2026-08-02']);
const importBuf = await wb.xlsx.writeBuffer();
fd = new FormData();
fd.append('file', new Blob([importBuf]), 'import.xlsx');
r = await call('/api/projects/import', { method: 'POST', token: admin, form: fd });
ok(r.status === 200 && r.data.success === 1, 'project import success 1');
r = await call('/api/project-import-template', { token: admin });
ok(r.status === 200, 'import template download');

// users & permissions
r = await call('/api/users', { method: 'POST', token: admin, body: { username: 'tester1', name: '测试员', role: 'viewer', password: 'test123', permissions: { project: { write: true } } } });
ok(r.status === 200 && r.data.id, 'create user');
const uid = r.data.id;
const tester = await login('tester1', 'test123');
r = await call('/api/projects', { method: 'POST', token: tester, body: { name: '权限测试项目' } });
ok(r.status === 200, 'custom user project write allowed');
if (r.status === 200) await call(`/api/projects/${r.data.id}`, { method: 'DELETE', token: admin });
r = await call('/api/projects/p001/fund-in', { method: 'POST', token: tester, body: { name: '越权款项' } });
ok(r.status === 403, 'custom user fund write denied');
r = await call(`/api/users/${uid}`, { method: 'DELETE', token: admin });
ok(r.status === 200, 'delete user');

// reminders
r = await call('/api/reminders', { token: admin });
ok(r.status === 200 && Array.isArray(r.data), 'reminders list');
r = await call('/api/remind-rules', { token: admin });
ok(r.status === 200 && r.data.length >= 10, 'remind rules >=10');

// cleanup test project
r = await call(`/api/projects/${pid}`, { method: 'DELETE', token: admin });
ok(r.status === 200, 'delete test project');

// delete imported project
r = await call('/api/projects', { token: admin });
const imp = r.data.find((p) => p.project_no === 'XM-IMP-999');
if (imp) { r = await call(`/api/projects/${imp.id}`, { method: 'DELETE', token: admin }); ok(r.status === 200, 'delete imported project'); }

// auth me & logout
r = await call('/api/auth/me', { token: admin });
ok(r.status === 200 && r.data.role === 'admin', 'auth me');

console.log(`\nAPI TEST RESULT: ${pass} passed, ${fail} failed`);
if (failures.length) console.log('FAILURES:', failures.join(' | '));
process.exit(fail ? 1 : 0);
