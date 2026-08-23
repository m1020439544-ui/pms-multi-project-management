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
  income_type TEXT,
  net_or_full TEXT,
  milestone TEXT,
  next_milestone TEXT,
  next_milestone_date TEXT,
  progress TEXT,
  delay_extension TEXT,
  delay_days INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS project_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT '售中',
  due_date TEXT,
  done_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  docs TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  category TEXT,
  item TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT '待检查',
  remark TEXT,
  checked_by TEXT,
  checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'forward',
  audit_type TEXT,
  clause TEXT,
  plan_date TEXT,
  done_date TEXT,
  status TEXT NOT NULL DEFAULT '待送审',
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  before_value TEXT,
  after_value TEXT,
  detail TEXT,
  changed_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contract_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  direction TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  path TEXT NOT NULL,
  uploader TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS operation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module TEXT NOT NULL DEFAULT 'contract',
  target_type TEXT,
  target_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  operator TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS contract_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  direction TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  file_id INTEGER,
  title TEXT,
  summary TEXT,
  risk_level TEXT,
  clauses TEXT NOT NULL DEFAULT '[]',
  model TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
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
  backward_sign_date: 'backward_sign_date TEXT',
  income_type: 'income_type TEXT',
  net_or_full: 'net_or_full TEXT',
  milestone: 'milestone TEXT',
  next_milestone: 'next_milestone TEXT',
  next_milestone_date: 'next_milestone_date TEXT',
  progress: 'progress TEXT',
  delay_extension: 'delay_extension TEXT',
  delay_days: 'delay_days INTEGER NOT NULL DEFAULT 0'
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
  ensureOfficialTemplates();
  ensureRemindRules();
  seedMilestones();
  migrateDictFoldersV2();
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
  const ensure = db.prepare('SELECT COUNT(*) AS c FROM kb_articles WHERE title = ?');
  const ins = db.prepare('INSERT INTO kb_articles(category_id,title,content,tags,author) VALUES(?,?,?,?,?)');
  const cat = db.prepare('SELECT id FROM kb_categories WHERE name = ? LIMIT 1').get('项目管理规范');
  const catId = cat ? cat.id : null;
  const checklist = [
    '客情关系', '是否低价中标，造成的实施交付影响需预估', '是否多次转包', '清单不含和其他专业的对接费',
    '同系统不同品牌产品之间的对接问题', '多个后向（含客支自主实施）的施工分界面、维保分界面',
    '后向是否提前进场', '整体方案是否过单项目', '总包管理费处理方式', '利旧系统、平台涉及的第三方对接、费用或二次开发',
    '工期明显不合理即预警工期', '合同外承诺甲方的软硬件需求', '合同是否包含和其他专业的对接费用',
    '明确深化设计、过程资料、竣工图谁来做', '合同外答应甲方的需求或承诺给甲方的物料', '合同清单不全面、缺漏项的兜底方',
    '前后向合同税率是否一致', '是否有保证金及缴费凭证', '是否有监理、是否审计（跟踪审计/结算审计）',
    '是否有主营收入', '后向采购分包情况、各分包单位界面', '设备采购交期是否能满足施工进度',
    '自主采购设备的送货、安装、调试、质保维护、配套辅材', '自主采购管材缺少配件（弯头、管卡）',
    '自主采购设备参数符合标书要求并需检测报告', '自主采购设备过质保的维修费用', '采购材料缺少详细参数、调试服务需明确',
    '材料清单报价与施工内容不符（审计风险）', '自主实施所需工器具与少量耗材提供方', '客支和后向的施工分界面',
    '客支参与实施，售后和后向维护分界面', '综合布线是否拆包', '配套其他专业布线的上架集成与维护职责',
    '借电信杆装箱是否按大网标准', '接电方式（挂表/自取）与电费支付', '传输方式（VPN/裸光纤）费用不允许打包给后向',
    '重大监控项目与后向明确监控完好率指标', '外场管线、开挖、做井等子项明确', '软件模块细节程度、数据输入输出管控标准',
    '提前实施软件项目需求重新梳理论证', '软件系统对接费用', '软件功能点实现方式', '平台类软件系统数据来源',
    '组网方案及实施是否原厂或后向单位', '光模块技术参数（距离）', '安服是否自主实施、实施人员',
    '服务报告提供方与审核方', '维保期限、响应时间、维保技术指标前后向同等', '驻场人员提供方与管理方式',
    '备品备件提供方'
  ];
  if (!ensure.get('售中交接问题清单（51项）').c) {
    ins.run(catId, '售中交接问题清单（51项）', checklist.map((x, i) => `${i + 1}. ${x}`).join('\n'), '交接,检查单,售中', 'PMO');
  }
  if (!ensure.get('六必有审计档案要求').c) {
    ins.run(catId, '六必有审计档案要求', '1.商机阶段截图\n2.客情维系截图\n3.方案与评审截图\n4.投标/谈判结果截图\n5.售中管控材料（开工、到货、实施、初验、终验）\n6.常青藤交维五要素截图', '审计,六必有', 'PMO');
  }
  if (!ensure.get('售中三必做管控矩阵').c) {
    ins.run(catId, '售中三必做管控矩阵', '开工：售前交底+开工启动会+实施方案+施工计划（必留：交底纪要、启动会纪要、实施方案、施工计划）\n到货：清点+签收+拍照（必留：到货清单、前后向签收单、现场照片）\n实施：随工打卡+检查+安全管理+周期报告\n初验：初验+培训+拍照+遗留问题\n终验：问题处理+终验拍照+报障二维码+转售后', '规范,售中,三必做', 'PMO');
  }
  if (!ensure.get('投资型项目内控与财务要求').c) {
    ins.run(catId, '投资型项目内控与财务要求', '100-500万须经总经理专题会审议；500万+须经总办会审议；3000万+须经省公司总办会审议。\n收投比不低于1.11（动态调整），NPV＞0。', '内控,财务,投资型', 'PMO');
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

function ensureOfficialTemplates() {
  const items = [
    ['doc', '售前交底会记录（附件1-1）', '项目情况、客户信息、问题风险及初步应对措施'],
    ['doc', '开工启动会记录（附件1-6）', '项目范围、分工界面、进度安排、人员投入、风险管控'],
    ['doc', '验收报告-前向（附件1-8）', '前向验收报告标准模板'],
    ['doc', '验收报告-后向（附件3.10）', '后向验收报告标准模板'],
    ['project', '总体实施方案-非软件开发类（附件1-4）', '需体现自有能力或与主营业务融合情况'],
    ['project', '总体实施方案-软件开发类（附件1-5）', '软件开发类实施方案模板'],
    ['project', '施工计划-非软件开发类（附件1-2）', '百万级≥7个主任务'],
    ['project', '施工计划-软件开发类（附件1-3）', '百万级≥7个主任务'],
    ['contract', '到货签收单-前向（附件1-7）', '建设/监理/承建三方签字'],
    ['contract', '到货签收单-后向', '电信方与合作方签字']
  ];
  const exists = db.prepare('SELECT COUNT(*) AS c FROM templates WHERE name = ?');
  const ins = db.prepare('INSERT INTO templates(type,name,description,version) VALUES(?,?,?,1)');
  for (const [type, name, desc] of items) {
    if (!exists.get(name).c) ins.run(type, name, desc);
  }
}

function ensureRemindRules() {
  const items = [
    ['保证金到期提醒', '投标保证金3个月/履约质保保证金验收后3个月逾期预警', '["系统内","首页待办"]'],
    ['开票回款预警', '我方开票3个月未回款将无法继续开票，提前预警', '["系统内","邮件"]'],
    ['收入欠费预警', '收入欠费超3个月即时预警', '["系统内","首页待办"]'],
    ['双周管控记录提醒', '百万级以上项目每30自然日至少2次施工管控记录', '["系统内"]'],
    ['超期180天预警', '项目超期180天进入专项跟踪', '["系统内","首页待办","企业微信"]']
  ];
  const exists = db.prepare('SELECT COUNT(*) AS c FROM remind_rules WHERE name = ?');
  const ins = db.prepare('INSERT INTO remind_rules(name,enabled,trigger_desc,channels) VALUES(?,1,?,?)');
  for (const [name, desc, channels] of items) {
    if (!exists.get(name).c) ins.run(name, desc, channels);
  }
}

function seedMilestones() {
  const projects = db.prepare('SELECT * FROM projects').all();
  for (const p of projects) seedProjectMilestones(p.id);
}

function seedProjectMilestones(projectId) {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!p) return;
  const count = db.prepare('SELECT COUNT(*) AS c FROM project_milestones WHERE project_id = ?').get(projectId);
  if (count.c > 0) return;
  const standard = [
    ['前向发起', '售前', ['中标通知书', '前向合同']],
    ['前向归档', '售前', ['前向合同归档材料']],
    ['后向发起', '采购', ['采购需求', '采购方案']],
    ['后向归档', '采购', ['后向合同', '采购结果']],
    ['开工', '售中', ['售前交底会纪要', '开工启动会记录', '总体实施方案', '施工计划']],
    ['到货', '售中', ['到货清单', '前向到货签收单', '后向到货签收单', '现场照片']],
    ['完工', '售中', ['现场管理记录', '施工管控记录', '实施照片']],
    ['完工款支付', '售中', ['付款凭证', '进度证明']],
    ['初验', '售中', ['前向初验报告', '后向初验报告']],
    ['初验支付', '售中', ['付款凭证']],
    ['终验', '售中', ['前向验收报告', '后向验收报告', '验收照片', '报障二维码照片']],
    ['终验支付', '售后', ['付款凭证']]
  ];
  const ins = db.prepare('INSERT INTO project_milestones(project_id,seq,name,stage,due_date,status,docs) VALUES(?,?,?,?,?,?,?)');
  const dates = [p.sign_date, p.forward_sign_date, p.backward_sign_date, p.backward_sign_date, p.start_date,
    p.start_date, null, null, p.expected_acceptance_date, null, p.expected_acceptance_date, null];
  standard.forEach(([name, stage, docs], i) => {
    ins.run(projectId, i + 1, name, stage, dates[i] || null, 'pending', JSON.stringify(docs));
  });
}

function migrateDictFoldersV2() {
  const migrated = db.prepare("SELECT value FROM app_state WHERE key = 'dict_folders_v2'").get();
  if (migrated) return;
  const projects = db.prepare('SELECT id FROM projects').all();
  for (const row of projects) {
    db.prepare('DELETE FROM doc_files WHERE project_id = ?').run(row.id);
    db.prepare('DELETE FROM doc_folders WHERE project_id = ?').run(row.id);
    seedDocFolders(row.id);
  }
  db.prepare("INSERT INTO app_state(key,value) VALUES('dict_folders_v2','1')").run();
}

function seedDocFolders(projectId) {
  const tree = [
    { name: '01-前向材料', children: [
      '01-招投标文件（招标文件、标前评审材料、投标文件盖章扫描件）',
      '02-中标通知书（原件+扫描件）',
      '03-设计方案（解决方案）',
      '04-需求沟通记录（微信沟通记录截图、沟通邮件等）',
      '05-前向合同（签约盖章版本）',
      '06-前向清单（合同清单、成本清单、利润率分析表、方案解构清单）',
      '07-三重一大上会材料和会议纪要、标前评审会议纪要、项目投标评审材料',
      '08-售前交底记录'
    ] },
    { name: '02-售中项目管理', children: [
      '01-后向采购',
      '02-后向合同',
      '03-项目清单',
      '04-收款付款',
      { name: '05-售中项目管理', children: [
        '00-项目清单', '01-售前交底', '02-开工启动会', '03-实施方案', '04-施工计划',
        '05-到货签收单', '06-项目实施', '07-验收报告（含进度报告）', '08-审计（前后向审计）', '09-形象材料'
      ] },
      '06-合同欠费清单'
    ] },
    { name: '03-收尾归档', children: ['01-归档清单', '02-审计材料（前后向）', '03-验收报告', '04-形象材料'] }
  ];
  let sort = 0;
  const folderIns = db.prepare('INSERT INTO doc_folders(project_id,parent_id,name,sort_order) VALUES(?,?,?,?)');
  function insert(node, parentId) {
    const r = folderIns.run(projectId, parentId, node.name, sort++);
    const id = Number(r.lastInsertRowid);
    (node.children || []).forEach((child, i) => insert(typeof child === 'string' ? { name: child } : child, id));
  }
  tree.forEach((top) => insert(top, null));
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
  seedDocFolders,
  seedProjectMilestones
};
