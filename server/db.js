const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'pms.db'));

db.exec(`
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  permissions TEXT NOT NULL DEFAULT '{}',
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_no TEXT,
  group_opportunity_code TEXT,
  approval_complete_date TEXT,
  start_date TEXT,
  expected_acceptance_date TEXT,
  sign_archive_date TEXT,
  our_unit TEXT,
  unit TEXT,
  customer_name TEXT,
  forward_contract_code TEXT,
  forward_contract_name TEXT,
  forward_contract_amount REAL NOT NULL DEFAULT 0,
  forward_sign_date TEXT,
  backward_contract_code TEXT,
  backward_contract_name TEXT,
  backward_unit_name TEXT,
  backward_contract_amount REAL NOT NULL DEFAULT 0,
  backward_sign_date TEXT,
  amount REAL NOT NULL DEFAULT 0,
  paid REAL NOT NULL DEFAULT 0,
  risk TEXT NOT NULL DEFAULT 'green',
  stage TEXT NOT NULL DEFAULT '启动',
  type TEXT,
  sign_date TEXT,
  deadline TEXT,
  pm TEXT,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS fund_in (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  cond TEXT,
  ratio REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  plan_date TEXT,
  recv_date TEXT,
  invoice TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  files TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fund_out (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  contract_id TEXT,
  name TEXT NOT NULL,
  cond TEXT,
  ratio REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  plan_date TEXT,
  recv_date TEXT,
  invoice TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  files TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sub_contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  supplier TEXT,
  signable REAL NOT NULL DEFAULT 0,
  signed REAL NOT NULL DEFAULT 0,
  paid REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  biz_type TEXT NOT NULL,
  biz_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  upload_time TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  uploader TEXT,
  path TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS doc_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  parent_id INTEGER,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS doc_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  folder_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  upload_time TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  note TEXT,
  ai_generated INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  path TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  amount REAL,
  due_date TEXT,
  level TEXT NOT NULL DEFAULT 'd7',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS remind_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  trigger_desc TEXT,
  channels TEXT NOT NULL DEFAULT '["系统内","首页待办"]'
);

CREATE TABLE IF NOT EXISTS ai_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  name TEXT NOT NULL,
  api_key_enc TEXT,
  endpoint TEXT,
  model TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS ai_capabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cap_key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  model_id INTEGER,
  FOREIGN KEY(model_id) REFERENCES ai_models(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ai_call_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  time TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  capability TEXT NOT NULL,
  model TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  request TEXT,
  response TEXT
);

CREATE TABLE IF NOT EXISTS menu_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  display TEXT NOT NULL,
  href TEXT NOT NULL,
  remark TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS kb_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS kb_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  author TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(category_id) REFERENCES kb_categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'doc',
  name TEXT NOT NULL,
  description TEXT,
  file_name TEXT,
  path TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`);

function ensureColumns(table, columns) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  for (const [name, ddl] of Object.entries(columns)) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  }
}

ensureColumns('users', {
  permissions: "permissions TEXT NOT NULL DEFAULT '{}'"
});

ensureColumns('projects', {
  project_no: 'project_no TEXT',
  group_opportunity_code: 'group_opportunity_code TEXT',
  approval_complete_date: 'approval_complete_date TEXT',
  start_date: 'start_date TEXT',
  expected_acceptance_date: 'expected_acceptance_date TEXT',
  sign_archive_date: 'sign_archive_date TEXT',
  our_unit: 'our_unit TEXT',
  customer_name: 'customer_name TEXT',
  forward_contract_code: 'forward_contract_code TEXT',
  forward_contract_name: 'forward_contract_name TEXT',
  forward_contract_amount: 'forward_contract_amount REAL NOT NULL DEFAULT 0',
  forward_sign_date: 'forward_sign_date TEXT',
  backward_contract_code: 'backward_contract_code TEXT',
  backward_contract_name: 'backward_contract_name TEXT',
  backward_unit_name: 'backward_unit_name TEXT',
  backward_contract_amount: 'backward_contract_amount REAL NOT NULL DEFAULT 0',
  backward_sign_date: 'backward_sign_date TEXT'
});

ensureColumns('menu_config', {
  roles: "roles TEXT NOT NULL DEFAULT '[\"admin\",\"viewer\"]'"
});

ensureColumns('sub_contracts', {
  code: 'code TEXT',
  sign_date: 'sign_date TEXT'
});

// ---------------- encryption helpers ----------------
const SECRET_PATH = path.join(DATA_DIR, 'secret.key');
let SECRET_KEY;
if (fs.existsSync(SECRET_PATH)) {
  SECRET_KEY = Buffer.from(fs.readFileSync(SECRET_PATH, 'utf8'), 'hex');
} else {
  SECRET_KEY = crypto.randomBytes(32);
  fs.writeFileSync(SECRET_PATH, SECRET_KEY.toString('hex'), { mode: 0o600 });
}

function encrypt(plain) {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', SECRET_KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':');
}

function decrypt(payload) {
  if (!payload) return '';
  const parts = String(payload).split(':');
  if (parts.length !== 3) return '';
  const [ivHex, tagHex, dataHex] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', SECRET_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return dec.toString('utf8');
}

// ---------------- password hashing ----------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const calc = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(calc, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function seed() {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    db.prepare('INSERT INTO users(username,name,role,password_hash) VALUES(?,?,?,?)')
      .run('pmo', '陈志远', 'admin', hashPassword('pmo2026'));
    db.prepare('INSERT INTO users(username,name,role,password_hash) VALUES(?,?,?,?)')
      .run('viewer', '只读用户', 'viewer', hashPassword('pmo2026'));
  }

  const projCount = db.prepare('SELECT COUNT(*) AS c FROM projects').get().c;
  if (projCount === 0) {
    const projects = [
      { id: 'p001', name: '智慧园区智能化改造', unit: 'XX市大数据局', amount: 3200, paid: 1984, risk: 'yellow', stage: '实施', type: '系统集成 · 智能化改造', sign_date: '2026-08-05', deadline: '2027-03-31', pm: '陈志远', remark: '重点回款跟踪' },
      { id: 'p002', name: '数据中台建设', unit: '省通信管理局', amount: 2400, paid: 1680, risk: 'red', stage: '实施', type: '数据中台', sign_date: '2026-06-20', deadline: '2027-02-28', pm: '陈志远', remark: '进度偏差超阈值，风险处置中' },
      { id: 'p003', name: '5G 核心网扩容', unit: '市移动分公司', amount: 4800, paid: 3360, risk: 'green', stage: '实施', type: '5G 网络', sign_date: '2026-07-15', deadline: '2027-05-31', pm: '陈志远', remark: '' },
      { id: 'p004', name: 'AI 客服系统', unit: '省电信公司', amount: 860, paid: 172, risk: 'red', stage: '启动', type: '智能化应用', sign_date: '2026-08-01', deadline: '2027-01-31', pm: '陈志远', remark: '供应商签约延期' },
      { id: 'p005', name: '智能运维平台', unit: '市政务服务局', amount: 1500, paid: 450, risk: 'yellow', stage: '启动', type: '智能运维', sign_date: '2026-07-28', deadline: '2027-04-30', pm: '陈志远', remark: '' },
      { id: 'p006', name: 'BSS 计费升级', unit: '市公安局科信处', amount: 620, paid: 620, risk: 'green', stage: '收尾', type: 'BSS 域', sign_date: '2026-02-10', deadline: '2026-09-30', pm: '陈志远', remark: '待归档' },
      { id: 'p007', name: '网络切片管理', unit: '市联通分公司', amount: 420, paid: 378, risk: 'green', stage: '收尾', type: '5G 网络', sign_date: '2026-01-15', deadline: '2026-08-31', pm: '陈志远', remark: '待归档' },
      { id: 'p008', name: '边缘计算节点部署', unit: '区行政审批局', amount: 1000, paid: 300, risk: 'green', stage: '实施', type: '边缘计算', sign_date: '2026-07-20', deadline: '2027-06-30', pm: '陈志远', remark: '' }
    ];
    const ins = db.prepare(`INSERT INTO projects(id,name,unit,amount,paid,risk,stage,type,sign_date,deadline,pm,remark)
      VALUES(@id,@name,@unit,@amount,@paid,@risk,@stage,@type,@sign_date,@deadline,@pm,@remark)`);
    for (const p of projects) ins.run(p);
  }

  // 为演示项目补充扩展字段（仅当尚未填写时，避免覆盖用户数据）
  const sampleFields = {
    p001: ['XM-2026-001', 'SJ-2026-0001', '2026-07-30', '2026-08-10', '2027-03-31', '2027-04-15', '江苏智联科技有限公司', 'XX市大数据局', 'FW-2026-001', '智慧园区智能化改造项目合同', 3200, '2026-08-05', 'HW-2026-001', '主集成实施合同', 'XX科技股份', 2000, '2026-08-06'],
    p002: ['XM-2026-002', 'SJ-2026-0002', '2026-06-10', '2026-06-25', '2027-02-28', '2027-03-15', '江苏智联科技有限公司', '省通信管理局', 'FW-2026-002', '数据中台建设项目合同', 2400, '2026-06-20', 'HW-2026-002', '数据平台采购合同', 'XX软件', 1000, '2026-06-22'],
    p003: ['XM-2026-003', 'SJ-2026-0003', '2026-07-05', '2026-07-20', '2027-05-31', '2027-06-15', '江苏智联科技有限公司', '市移动分公司', 'FW-2026-003', '5G 核心网扩容项目合同', 4800, '2026-07-15', 'HW-2026-003', '核心网设备采购合同', 'XX设备制造', 3600, '2026-07-18'],
    p004: ['XM-2026-004', 'SJ-2026-0004', '2026-07-25', '2026-08-05', '2027-01-31', '2027-02-15', '江苏智联科技有限公司', '省电信公司', 'FW-2026-004', 'AI 客服系统项目合同', 860, '2026-08-01', 'HW-2026-004', 'AI 模型供应合同', 'XX人工智能', 500, '2026-08-03'],
    p005: ['XM-2026-005', 'SJ-2026-0005', '2026-07-20', '2026-08-01', '2027-04-30', '2027-05-15', '江苏智联科技有限公司', '市政务服务局', 'FW-2026-005', '智能运维平台项目合同', 1500, '2026-07-28', 'HW-2026-005', '运维平台实施合同', 'XX信息', 900, '2026-07-30'],
    p006: ['XM-2026-006', 'SJ-2026-0006', '2026-02-01', '2026-02-15', '2026-09-30', '2026-10-10', '江苏智联科技有限公司', '市公安局科信处', 'FW-2026-006', 'BSS 计费升级项目合同', 620, '2026-02-10', 'HW-2026-006', '计费系统实施合同', 'XX软件', 400, '2026-02-12'],
    p007: ['XM-2026-007', 'SJ-2026-0007', '2026-01-05', '2026-01-20', '2026-08-31', '2026-09-10', '江苏智联科技有限公司', '市联通分公司', 'FW-2026-007', '网络切片管理项目合同', 420, '2026-01-15', 'HW-2026-007', '网络切片平台采购合同', 'XX网络', 300, '2026-01-18'],
    p008: ['XM-2026-008', 'SJ-2026-0008', '2026-07-10', '2026-07-25', '2027-06-30', '2027-07-15', '江苏智联科技有限公司', '区行政审批局', 'FW-2026-008', '边缘计算节点部署项目合同', 1000, '2026-07-20', 'HW-2026-008', '边缘计算实施合同', 'XX云计算', 700, '2026-07-22']
  };
  const upd = db.prepare(`UPDATE projects SET
    project_no=?, group_opportunity_code=?, approval_complete_date=?, start_date=?, expected_acceptance_date=?, sign_archive_date=?,
    our_unit=?, customer_name=?, forward_contract_code=?, forward_contract_name=?, forward_contract_amount=?, forward_sign_date=?,
    backward_contract_code=?, backward_contract_name=?, backward_unit_name=?, backward_contract_amount=?, backward_sign_date=?
    WHERE id=? AND project_no IS NULL`);
  for (const [id, f] of Object.entries(sampleFields)) upd.run(...f, id);

  const fundInCount = db.prepare('SELECT COUNT(*) AS c FROM fund_in').get().c;
  if (fundInCount === 0) {
    const ins = db.prepare(`INSERT INTO fund_in(project_id,name,cond,ratio,amount,plan_date,recv_date,invoice,status,files)
      VALUES(?,?,?,?,?,?,?,?,?,?)`);
    const rows = [
      ['p001', '签约款', '合同签订后 10 日内', 30, 960, '2026-08-20', '2026-08-25', 'INV-2026-001', 'received', '[]'],
      ['p001', '进度款（按工程量）', '工程量达 50%', 40, 1280, '2026-11-30', null, '', 'planned', '[]'],
      ['p001', '里程碑款', '核心系统上线', 20, 640, '2027-02-28', null, '', 'planned', '[]'],
      ['p001', '终验款', '项目终验合格', 7, 224, '2027-03-15', null, '', 'planned', '[]'],
      ['p001', '质保金', '质保期届满', 3, 96, '2028-03-31', null, '', 'planned', '[]'],
      ['p002', '签约款', '合同签订后 10 日内', 30, 720, '2026-07-05', '2026-07-10', 'INV-2026-012', 'received', '[]'],
      ['p002', '进度款（按月计量）', '按月计量支付', 50, 1200, '2026-09-30', null, '', 'planned', '[]'],
      ['p002', '终验款', '终验合格', 20, 480, '2027-02-15', null, '', 'planned', '[]'],
      ['p004', '签约款', '合同签订后支付', 30, 258, '2026-08-10', null, '', 'planned', '[]'],
      ['p006', '终验款', '已全部回款', 100, 620, '2026-08-01', '2026-08-05', 'INV-2026-003', 'received', '[]']
    ];
    for (const r of rows) ins.run(...r);
  }

  const fundOutCount = db.prepare('SELECT COUNT(*) AS c FROM fund_out').get().c;
  if (fundOutCount === 0) {
    const ins = db.prepare(`INSERT INTO fund_out(project_id,contract_id,name,cond,ratio,amount,plan_date,recv_date,invoice,status,files)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
    const rows = [
      ['p001', null, '预付款', '主集成商预付款', 30, 600, '2026-09-01', null, '', 'planned', '[]'],
      ['p001', null, '进度款', '按里程碑支付', 40, 800, '2026-12-31', null, '', 'planned', '[]'],
      ['p001', null, '尾款', '验收后支付', 30, 600, '2027-04-30', null, '', 'planned', '[]']
    ];
    for (const r of rows) ins.run(...r);
  }

  const subCount = db.prepare('SELECT COUNT(*) AS c FROM sub_contracts').get().c;
  if (subCount === 0) {
    const ins = db.prepare('INSERT INTO sub_contracts(project_id,name,supplier,signable,signed,paid) VALUES(?,?,?,?,?,?)');
    ins.run('p001', '主集成商合同', 'XX科技股份', 2000, 1500, 1000);
    ins.run('p001', '设备供应合同', 'XX设备制造', 1200, 800, 500);
    ins.run('p002', '数据平台采购', 'XX软件', 1000, 600, 400);
  }

  const ruleCount = db.prepare('SELECT COUNT(*) AS c FROM remind_rules').get().c;
  if (ruleCount === 0) {
    const rules = [
      ['回款应收提醒', 1, '应收日前 7 / 3 / 1 天三级提醒；逾期当日红色预警', '["系统内","首页待办","邮件"]'],
      ['里程碑提醒', 1, '里程碑节点前 3 天提醒', '["系统内","首页待办"]'],
      ['风险预警', 1, '进度偏差 > 10 天 / 回款逾期 / 后向签约超可签约额即时推送', '["系统内","首页待办","企业微信"]'],
      ['文档归档提醒', 1, '收尾阶段归档清单生成提醒', '["系统内"]'],
      ['质保金到期提醒', 0, '质保金到期前 7 天提醒', '["系统内","邮件"]']
    ];
    const ins = db.prepare('INSERT INTO remind_rules(name,enabled,trigger_desc,channels) VALUES(?,?,?,?)');
    for (const r of rules) ins.run(...r);
  }

  const menuCount = db.prepare('SELECT COUNT(*) AS c FROM menu_config').get().c;
  if (menuCount === 0) {
    const menus = [
      { parent_id: null, key: 'overview', name: '总览', display: '总览', href: '#/overview', remark: '项目组合看板与统计', sort_order: 1, visible: 1 },
      { parent_id: null, key: 'project', name: '项目', display: '项目', href: '#/projects', remark: '项目全生命周期管理', sort_order: 2, visible: 1 },
      { parent_id: 2, key: 'projects', name: '项目选择', display: '项目选择', href: '#/projects', remark: '项目列表与工作区入口', sort_order: 1, visible: 1 },
      { parent_id: 2, key: 'project-detail', name: '项目信息表', display: '项目信息表', href: '#/project-detail', remark: '基本信息与前后向资金', sort_order: 2, visible: 1 },
      { parent_id: 2, key: 'project-stages', name: '三阶段流程', display: '三阶段流程', href: '#/project-stages', remark: '启动 / 实施 / 收尾', sort_order: 3, visible: 1 },
      { parent_id: null, key: 'docs', name: '文档', display: '文档', href: '#/documents', remark: '文档中心与标准化模板', sort_order: 3, visible: 1 },
      { parent_id: null, key: 'remind', name: '提醒', display: '提醒', href: '#/reminders', remark: '回款 / 里程碑 / 风险提醒', sort_order: 4, visible: 1 },
      { parent_id: null, key: 'ai', name: 'AI 配置', display: 'AI 配置', href: '#/ai-config', remark: '大模型接入与能力管理', sort_order: 5, visible: 1 },
      { parent_id: null, key: 'settings', name: '设置', display: '设置', href: '#/settings', remark: '菜单自定义与系统配置', sort_order: 6, visible: 1 }
    ];
    const ins = db.prepare(`INSERT INTO menu_config(parent_id,key,name,display,href,remark,sort_order,visible)
      VALUES(@parent_id,@key,@name,@display,@href,@remark,@sort_order,@visible)`);
    for (const m of menus) ins.run(m);
  }

  const modelCount = db.prepare('SELECT COUNT(*) AS c FROM ai_models').get().c;
  if (modelCount === 0) {
    const models = [
      { provider: 'deepseek', name: 'DeepSeek', api_key_enc: '', endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', is_primary: 1, enabled: 1 },
      { provider: 'qwen', name: '通义千问', api_key_enc: '', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus', is_primary: 0, enabled: 1 },
      { provider: 'internal', name: '公司内部私有化模型', api_key_enc: '', endpoint: '', model: '', is_primary: 0, enabled: 0 }
    ];
    const ins = db.prepare(`INSERT INTO ai_models(provider,name,api_key_enc,endpoint,model,is_primary,enabled)
      VALUES(@provider,@name,@api_key_enc,@endpoint,@model,@is_primary,@enabled)`);
    for (const m of models) ins.run(m);
  }

  const capCount = db.prepare('SELECT COUNT(*) AS c FROM ai_capabilities').get().c;
  if (capCount === 0) {
    const primary = db.prepare('SELECT id FROM ai_models WHERE is_primary=1').get();
    const caps = [
      ['extract', '字段抽取', 1, primary ? primary.id : null],
      ['riskReview', '风险审核', 1, primary ? primary.id : null],
      ['docGen', '文档生成', 1, primary ? primary.id : null],
      ['remind', '智能提醒', 0, primary ? primary.id : null],
      ['knowledge', '知识库问答', 0, primary ? primary.id : null]
    ];
    const ins = db.prepare('INSERT INTO ai_capabilities(cap_key,name,enabled,model_id) VALUES(?,?,?,?)');
    for (const c of caps) ins.run(...c);
  }

  // Seed DICT standard document folders for existing projects
  const folderCount = db.prepare('SELECT COUNT(*) AS c FROM doc_folders').get().c;
  if (folderCount === 0) {
    const rows = db.prepare('SELECT id FROM projects').all();
    for (const row of rows) {
      seedDocFolders(row.id);
    }
  }

  ensureDefaultMenu();
  seedKnowledgeBase();
  seedTemplates();
}

function ensureDefaultMenu() {
  const defaults = [
    { key: 'overview', name: '总览', display: '总览', href: '#/overview', remark: '项目组合看板与统计', sort_order: 1, visible: 1, roles: '["admin","viewer"]' },
    { key: 'project', name: '项目', display: '项目', href: '#/projects', remark: '项目全生命周期管理', sort_order: 2, visible: 1, roles: '["admin","viewer"]' },
    { key: 'contracts', name: '合同管理', display: '合同管理', href: '#/contracts', remark: '前向/后向合同台账与付款计划', sort_order: 3, visible: 1, roles: '["admin","viewer"]' },
    { key: 'docs', name: '文档', display: '文档', href: '#/documents', remark: '文档中心与标准化模板', sort_order: 4, visible: 1, roles: '["admin","viewer"]' },
    { key: 'templates', name: '模板管理', display: '模板管理', href: '#/templates', remark: '文档/项目/合同模板与版本管理', sort_order: 5, visible: 1, roles: '["admin","viewer"]' },
    { key: 'pmo', name: 'PMO管理', display: 'PMO管理', href: '#/pmo', remark: '项目管理办公室工作台与成员', sort_order: 6, visible: 1, roles: '["admin"]' },
    { key: 'kb', name: '知识库', display: '知识库', href: '#/kb', remark: '项目管理知识库与 AI 问答', sort_order: 7, visible: 1, roles: '["admin","viewer"]' },
    { key: 'remind', name: '提醒', display: '提醒', href: '#/reminders', remark: '回款 / 里程碑 / 风险提醒', sort_order: 8, visible: 1, roles: '["admin","viewer"]' },
    { key: 'ai', name: 'AI 配置', display: 'AI 配置', href: '#/ai-config', remark: '大模型接入与能力管理', sort_order: 9, visible: 1, roles: '["admin"]' },
    { key: 'settings', name: '设置', display: '设置', href: '#/settings', remark: '菜单自定义与系统配置', sort_order: 10, visible: 1, roles: '["admin"]' },
    { key: 'projects', name: '项目选择', display: '项目选择', href: '#/projects', remark: '项目列表与工作区入口', sort_order: 1, visible: 1, roles: '["admin","viewer"]', parent_key: 'project' },
    { key: 'project-detail', name: '项目信息表', display: '项目信息表', href: '#/project-detail', remark: '基本信息与前后向资金', sort_order: 2, visible: 1, roles: '["admin","viewer"]', parent_key: 'project' },
    { key: 'project-stages', name: '三阶段流程', display: '三阶段流程', href: '#/project-stages', remark: '启动 / 实施 / 收尾', sort_order: 3, visible: 1, roles: '["admin","viewer"]', parent_key: 'project' }
  ];
  const insert = db.prepare('INSERT INTO menu_config(parent_id,key,name,display,href,remark,sort_order,visible,roles) VALUES(?,?,?,?,?,?,?,?,?)');
  const keyToId = new Map(db.prepare('SELECT key, id FROM menu_config').all().map((r) => [r.key, r.id]));
  for (const d of defaults.filter((d) => !d.parent_key)) {
    if (!keyToId.has(d.key)) {
      const r = insert.run(null, d.key, d.name, d.display, d.href, d.remark, d.sort_order, d.visible, d.roles);
      keyToId.set(d.key, Number(r.lastInsertRowid));
    }
  }
  for (const d of defaults.filter((d) => d.parent_key)) {
    if (!keyToId.has(d.key)) {
      const r = insert.run(keyToId.get(d.parent_key) || null, d.key, d.name, d.display, d.href, d.remark, d.sort_order, d.visible, d.roles);
      keyToId.set(d.key, Number(r.lastInsertRowid));
    }
  }
  // 一次性迁移：将默认菜单调整到推荐顺序（仅执行一次，之后尊重用户在系统设置中的自定义排序）
  const migrated = db.prepare("SELECT value FROM app_state WHERE key = 'menu_v2_sort_migrated'").get();
  if (!migrated) {
    const upd = db.prepare('UPDATE menu_config SET sort_order = ?, roles = ? WHERE key = ?');
    for (const d of defaults) upd.run(d.sort_order, d.roles, d.key);
    db.prepare("INSERT INTO app_state(key,value) VALUES('menu_v2_sort_migrated','1')").run();
  }
}

function seedKnowledgeBase() {
  const catCount = db.prepare('SELECT COUNT(*) AS c FROM kb_categories').get().c;
  if (catCount === 0) {
    const ins = db.prepare('INSERT INTO kb_categories(parent_id,name,sort_order) VALUES(?,?,?)');
    const r1 = ins.run(null, '项目管理规范', 0);
    const r2 = ins.run(null, '项目经验沉淀', 1);
    const r3 = ins.run(null, '案例库', 2);
    ins.run(Number(r1.lastInsertRowid), '售中流程规范', 0);
    ins.run(Number(r1.lastInsertRowid), '交付验收标准', 1);
    ins.run(Number(r2.lastInsertRowid), '优秀实践', 0);
    ins.run(Number(r2.lastInsertRowid), '复盘与教训', 1);
    ins.run(Number(r3.lastInsertRowid), '智能化项目案例', 0);
    ins.run(Number(r3.lastInsertRowid), '运营商项目案例', 1);
  }
  const articleCount = db.prepare('SELECT COUNT(*) AS c FROM kb_articles').get().c;
  if (articleCount === 0) {
    const cat = db.prepare('SELECT id FROM kb_categories ORDER BY id LIMIT 1').get();
    db.prepare('INSERT INTO kb_articles(category_id,title,content,tags,author) VALUES(?,?,?,?,?)')
      .run(cat ? cat.id : null, '售中项目管理要点', '按启动、实施、收尾三阶段管控；回款台账与里程碑绑定跟踪；风险分级处置。', '规范,售中', 'PMO');
    db.prepare('INSERT INTO kb_articles(category_id,title,content,tags,author) VALUES(?,?,?,?,?)')
      .run(cat ? cat.id : null, '终验注意事项', '终验前完成资料归档、问题闭环与客户确认，终验款与验收单联动。', '验收,经验', 'PMO');
  }
}

function seedTemplates() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM templates').get().c;
  if (count === 0) {
    const ins = db.prepare('INSERT INTO templates(type,name,description,version) VALUES(?,?,?,1)');
    ins.run('doc', '项目信息表模板', '江苏省智能化项目规范 · 项目信息表');
    ins.run('doc', '项目周报模板', '项目周报标准格式');
    ins.run('doc', '验收报告模板', '终验报告标准格式');
    ins.run('project', '项目立项模板', '项目立项申请与审批要素');
    ins.run('contract', '合同评审模板', '前向/后向合同风险评审清单');
  }
}

function seedDocFolders(projectId) {
  const tree = [
    { name: '01-前向材料', children: ['合同与协议', '标书', '中标通知', '发票', '回款凭证', '验收单', '里程碑证明', '质保金材料'] },
    { name: '02-售中项目管理', children: ['项目计划', '进度报告', '周报', '月报', '会议纪要'] },
    { name: '03-收尾归档', children: ['归档清单', '竣工资料', '验收报告'] }
  ];
  let sort = 0;
  const folderIns = db.prepare('INSERT INTO doc_folders(project_id,parent_id,name,sort_order) VALUES(?,?,?,?)');
  for (const top of tree) {
    const r = folderIns.run(projectId, null, top.name, sort++);
    const parentId = Number(r.lastInsertRowid);
    top.children.forEach((name, i) => folderIns.run(projectId, parentId, name, i));
  }
}

module.exports = {
  db,
  DATA_DIR,
  UPLOAD_DIR,
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
  seed,
  seedDocFolders
};
