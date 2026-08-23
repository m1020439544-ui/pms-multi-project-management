const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const ExcelJS = require('exceljs');
const { db, encrypt, decrypt, seedDocFolders, UPLOAD_DIR, hashPassword } = require('./db');
const { login, logout, requireAuth, requireAdmin, requireWrite, getSessionUser, fmt } = require('./auth');
const ai = require('./ai');

function now() {
  return fmt(new Date());
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function project(id) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

function deriveProject(p) {
  if (!p) return null;
  return {
    ...p,
    paymentRatio: p.amount > 0 ? Math.round((p.paid / p.amount) * 10000) / 100 : 0,
    unpaid: Math.round((p.amount - p.paid) * 100) / 100
  };
}

function deriveFundStatus(row) {
  const t = today();
  if (row.recv_date) return 'received';
  if (row.status === 'partial') return 'partial';
  if (!row.plan_date) return 'planned';
  if (row.plan_date < t) return 'overdue';
  const diff = Math.ceil((new Date(row.plan_date) - new Date(t)) / 86400000);
  if (diff <= 7) return 'due';
  return 'planned';
}

function deriveFund(row) {
  return { ...row, status: deriveFundStatus(row), files: safeJson(row.files, []) };
}

function safeJson(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function sendError(res, code, message) {
  return res.status(code).json({ error: message });
}

function menuVisibleForRole(m, role) {
  if (role === 'admin') return true;
  let roles = [];
  try { roles = JSON.parse(m.roles || '[]'); } catch (e) { roles = []; }
  return roles.includes(role);
}

function buildMenuTree(role) {
  const flat = db.prepare('SELECT * FROM menu_config ORDER BY sort_order, id').all();
  const allowed = flat.filter((m) => m.visible && menuVisibleForRole(m, role || 'admin'));
  const top = allowed.filter((m) => !m.parent_id);
  const children = allowed.filter((m) => m.parent_id);
  return top.map((m) => ({
    ...m,
    visible: !!m.visible,
    children: children.filter((c) => c.parent_id === m.id),
    roles: safeJson(m.roles, [])
  }));
}

function registerRoutes(app, upload) {
  // ---------------- auth ----------------
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return sendError(res, 400, '请输入用户名和密码');
    const result = login(username, password);
    if (!result) return sendError(res, 401, '用户名或密码错误');
    res.json(result);
  });

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    const header = req.headers.authorization || '';
    logout(header.startsWith('Bearer ') ? header.slice(7) : '');
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json(req.user);
  });

  // ---------------- menu ----------------
  app.get('/api/menu', requireAuth, (req, res) => {
    res.json(buildMenuTree(req.user.role));
  });

  app.get('/api/menu/items', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT * FROM menu_config ORDER BY sort_order, id').all().map((m) => ({ ...m, roles: safeJson(m.roles, []) })));
  });

  app.post('/api/menu/items', requireAuth, requireWrite('menu'), (req, res) => {
    const b = req.body || {};
    if (!b.key || !b.display) return sendError(res, 400, '缺少 key 或显示名');
    const keyExists = db.prepare('SELECT id FROM menu_config WHERE key = ?').get(b.key);
    if (keyExists) return sendError(res, 409, '菜单 key 已存在');
    const roles = JSON.stringify(Array.isArray(b.roles) && b.roles.length ? b.roles : ['admin', 'viewer']);
    const r = db.prepare(`INSERT INTO menu_config(parent_id,key,name,display,href,remark,sort_order,visible,roles)
      VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(b.parent_id || null, b.key, b.name || b.display, b.display, b.href || '', b.remark || '', Number(b.sort_order || 0), b.visible === false ? 0 : 1, roles);
    res.json(db.prepare('SELECT * FROM menu_config WHERE id = ?').get(Number(r.lastInsertRowid)));
  });

  app.put('/api/menu/items/:id', requireAuth, requireWrite('menu'), (req, res) => {
    const id = Number(req.params.id);
    const cur = db.prepare('SELECT * FROM menu_config WHERE id = ?').get(id);
    if (!cur) return sendError(res, 404, '菜单项不存在');
    const b = req.body || {};
    const key = b.key ?? cur.key;
    const conflict = db.prepare('SELECT id FROM menu_config WHERE key = ? AND id != ?').get(key, id);
    if (conflict) return sendError(res, 409, '菜单 key 已存在');
    db.prepare(`UPDATE menu_config SET parent_id=?, key=?, name=?, display=?, href=?, remark=?, sort_order=?, visible=?, roles=?
      WHERE id=?`)
      .run(b.parent_id ?? cur.parent_id, key, b.name ?? cur.name, b.display ?? cur.display, b.href ?? cur.href,
        b.remark ?? cur.remark, Number(b.sort_order ?? cur.sort_order), b.visible === false ? 0 : 1,
        JSON.stringify(Array.isArray(b.roles) && b.roles.length ? b.roles : safeJson(cur.roles, [])), id);
    res.json(db.prepare('SELECT * FROM menu_config WHERE id = ?').get(id));
  });

  app.delete('/api/menu/items/:id', requireAuth, requireWrite('menu'), (req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM menu_config WHERE parent_id = ?').run(id);
    db.prepare('DELETE FROM menu_config WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  // ---------------- menu export / import ----------------
  app.get('/api/menu/export', requireAuth, (req, res) => {
    const flat = db.prepare('SELECT * FROM menu_config ORDER BY sort_order, id').all();
    const byId = new Map(flat.map((m) => [m.id, m]));
    const exported = flat.map((m) => ({
      key: m.key,
      name: m.name,
      display: m.display,
      href: m.href,
      remark: m.remark,
      sort_order: m.sort_order,
      visible: !!m.visible,
      roles: safeJson(m.roles, []),
      parent_key: m.parent_id ? (byId.get(m.parent_id) ? byId.get(m.parent_id).key : '') : ''
    }));
    res.json({ version: 1, type: 'pms-menu-config', items: exported });
  });

  app.get('/api/menu/template', requireAuth, (req, res) => {
    res.json({
      version: 1,
      type: 'pms-menu-config',
      description: '菜单显示配置模板：key 唯一；parent_key 为空表示顶级菜单；visible 为 true/false；sort_order 控制排序。',
      items: [
        { key: 'overview', name: '总览', display: '总览', href: '#/overview', remark: '项目组合看板与统计', sort_order: 1, visible: true, roles: ['admin', 'viewer'], parent_key: '' },
        { key: 'project', name: '项目', display: '项目', href: '#/projects', remark: '项目全生命周期管理', sort_order: 2, visible: true, roles: ['admin', 'viewer'], parent_key: '' },
        { key: 'projects', name: '项目选择', display: '项目选择', href: '#/projects', remark: '项目列表与工作区入口', sort_order: 1, visible: true, roles: ['admin', 'viewer'], parent_key: 'project' },
        { key: 'project-detail', name: '项目信息表', display: '项目信息表', href: '#/project-detail', remark: '基本信息与前后向资金', sort_order: 2, visible: true, roles: ['admin', 'viewer'], parent_key: 'project' },
        { key: 'project-stages', name: '三阶段流程', display: '三阶段流程', href: '#/project-stages', remark: '启动 / 实施 / 收尾', sort_order: 3, visible: true, roles: ['admin', 'viewer'], parent_key: 'project' },
        { key: 'contracts', name: '合同管理', display: '合同管理', href: '#/contracts', remark: '前向/后向合同台账与付款计划', sort_order: 3, visible: true, roles: ['admin', 'viewer'], parent_key: '' },
        { key: 'docs', name: '文档', display: '文档', href: '#/documents', remark: '文档中心与标准化模板', sort_order: 4, visible: true, roles: ['admin', 'viewer'], parent_key: '' },
        { key: 'templates', name: '模板管理', display: '模板管理', href: '#/templates', remark: '文档/项目/合同模板与版本管理', sort_order: 5, visible: true, roles: ['admin', 'viewer'], parent_key: '' },
        { key: 'pmo', name: 'PMO管理', display: 'PMO管理', href: '#/pmo', remark: '项目管理办公室工作台与成员', sort_order: 6, visible: true, roles: ['admin'], parent_key: '' },
        { key: 'kb', name: '知识库', display: '知识库', href: '#/kb', remark: '项目管理知识库与 AI 问答', sort_order: 7, visible: true, roles: ['admin', 'viewer'], parent_key: '' },
        { key: 'remind', name: '提醒', display: '提醒', href: '#/reminders', remark: '回款 / 里程碑 / 风险提醒', sort_order: 8, visible: true, roles: ['admin', 'viewer'], parent_key: '' },
        { key: 'ai', name: 'AI 配置', display: 'AI 配置', href: '#/ai-config', remark: '大模型接入与能力管理', sort_order: 9, visible: true, roles: ['admin'], parent_key: '' },
        { key: 'settings', name: '设置', display: '设置', href: '#/settings', remark: '菜单自定义与系统配置', sort_order: 10, visible: true, roles: ['admin'], parent_key: '' }
      ]
    });
  });

  app.post('/api/menu/import', requireAuth, requireWrite('menu'), (req, res) => {
    const payload = req.body || {};
    const items = Array.isArray(payload) ? payload : payload.items;
    if (!Array.isArray(items) || items.length === 0) return sendError(res, 400, '导入数据为空或格式不正确');
    const normalized = [];
    for (let i = 0; i < items.length; i++) {
      const m = items[i] || {};
      if (!m.key || !m.display) return sendError(res, 400, `第 ${i + 1} 项缺少 key 或 display`);
      normalized.push({
        key: String(m.key),
        name: String(m.name || m.display),
        display: String(m.display),
        href: String(m.href || ''),
        remark: String(m.remark || ''),
        sort_order: Number(m.sort_order || 0),
        visible: m.visible === false ? 0 : 1,
        roles: Array.isArray(m.roles) && m.roles.length ? m.roles : ['admin', 'viewer'],
        parent_key: m.parent_key || ''
      });
    }
    const keys = new Set(normalized.map((m) => m.key));
    if (keys.size !== normalized.length) return sendError(res, 400, '菜单 key 存在重复');
    // 增量合并：按 key 更新或新增，不删除未在导入文件中的菜单
    const keyToId = new Map(db.prepare('SELECT key, id FROM menu_config').all().map((r) => [r.key, r.id]));
    const insert = db.prepare(`INSERT INTO menu_config(parent_id,key,name,display,href,remark,sort_order,visible,roles)
      VALUES(?,?,?,?,?,?,?,?,?)`);
    const update = db.prepare(`UPDATE menu_config SET name=?, display=?, href=?, remark=?, sort_order=?, visible=?, roles=? WHERE key=?`);
    let added = 0, updated = 0;
    for (const m of normalized) {
      if (keyToId.has(m.key)) {
        update.run(m.name, m.display, m.href, m.remark, m.sort_order, m.visible, JSON.stringify(m.roles), m.key);
        updated++;
      } else {
        const r = insert.run(null, m.key, m.name, m.display, m.href, m.remark, m.sort_order, m.visible, JSON.stringify(m.roles));
        keyToId.set(m.key, Number(r.lastInsertRowid));
        added++;
      }
    }
    // 第二遍：重建父子关系
    const setParent = db.prepare('UPDATE menu_config SET parent_id=? WHERE key=?');
    for (const m of normalized) {
      if (m.parent_key && keyToId.has(m.parent_key)) setParent.run(keyToId.get(m.parent_key), m.key);
      else if (!m.parent_key) setParent.run(null, m.key);
    }
    res.json({ ok: true, count: normalized.length, added, updated });
  });

  // ---------------- settings: project display mode ----------------
  app.get('/api/settings/project-view', requireAuth, (req, res) => {
    const row = db.prepare("SELECT value FROM app_state WHERE key = 'project_view_mode'").get();
    res.json({ view: row ? row.value : 'card' });
  });

  app.put('/api/settings/project-view', requireAuth, (req, res) => {
    const b = req.body || {};
    const view = b.view === 'table' ? 'table' : 'card';
    db.prepare(`INSERT INTO app_state(key,value) VALUES('project_view_mode', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(view);
    res.json({ view });
  });

  // ---------------- users & permissions ----------------
  app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
    const rows = db.prepare('SELECT id, username, name, role, permissions, created_at FROM users ORDER BY id').all();
    res.json(rows.map((u) => ({ ...u, permissions: safeJson(u.permissions, {}) })));
  });

  app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
    const b = req.body || {};
    if (!b.username || !b.name || !b.password) return sendError(res, 400, '用户名、姓名、密码不能为空');
    if (!['admin', 'viewer'].includes(b.role)) return sendError(res, 400, '角色不合法');
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(b.username);
    if (exists) return sendError(res, 409, '用户名已存在');
    const r = db.prepare('INSERT INTO users(username,name,role,permissions,password_hash) VALUES(?,?,?,?,?)')
      .run(b.username, b.name, b.role, JSON.stringify(b.permissions || {}), hashPassword(b.password));
    const u = db.prepare('SELECT id, username, name, role, permissions, created_at FROM users WHERE id = ?').get(Number(r.lastInsertRowid));
    res.json({ ...u, permissions: safeJson(u.permissions, {}) });
  });

  app.put('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const cur = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!cur) return sendError(res, 404, '用户不存在');
    const b = req.body || {};
    if (b.role && !['admin', 'viewer'].includes(b.role)) return sendError(res, 400, '角色不合法');
    db.prepare('UPDATE users SET name=?, role=?, permissions=? WHERE id=?')
      .run(b.name ?? cur.name, b.role ?? cur.role, JSON.stringify(b.permissions ?? safeJson(cur.permissions, {})), id);
    if (b.password) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(b.password), id);
    const u = db.prepare('SELECT id, username, name, role, permissions, created_at FROM users WHERE id = ?').get(id);
    res.json({ ...u, permissions: safeJson(u.permissions, {}) });
  });

  app.delete('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) return sendError(res, 400, '不能删除当前登录用户');
    const cur = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!cur) return sendError(res, 404, '用户不存在');
    if (cur.role === 'admin') {
      const admins = db.prepare('SELECT COUNT(*) AS c FROM users WHERE role = ?').get('admin');
      if (admins.c <= 1) return sendError(res, 400, '至少保留一个管理员');
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  // ---------------- projects ----------------
  app.get('/api/projects', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all().map(deriveProject);
    res.json(rows);
  });

  app.get('/api/projects/:id', requireAuth, (req, res) => {
    const p = project(req.params.id);
    if (!p) return sendError(res, 404, '项目不存在');
    res.json(deriveProject(p));
  });

  app.post('/api/projects', requireAuth, requireWrite('project'), (req, res) => {
    const b = req.body || {};
    if (!b.name) return sendError(res, 400, '项目名称不能为空');
    const id = b.id || ('p' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36));
    if (db.prepare('SELECT id FROM projects WHERE id = ?').get(id)) return sendError(res, 409, '项目编号已存在');
    db.prepare(`INSERT INTO projects(id,name,project_no,group_opportunity_code,approval_complete_date,start_date,expected_acceptance_date,sign_archive_date,our_unit,unit,customer_name,forward_contract_code,forward_contract_name,forward_contract_amount,forward_sign_date,backward_contract_code,backward_contract_name,backward_unit_name,backward_contract_amount,backward_sign_date,income_type,net_or_full,milestone,next_milestone,next_milestone_date,progress,delay_extension,delay_days,amount,paid,risk,stage,type,sign_date,deadline,pm,remark,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, b.name, b.project_no || '', b.group_opportunity_code || '', b.approval_complete_date || null, b.start_date || null,
        b.expected_acceptance_date || null, b.sign_archive_date || null, b.our_unit || '', b.unit || '',
        b.customer_name || b.unit || '', b.forward_contract_code || '', b.forward_contract_name || '',
        Number(b.forward_contract_amount || 0), b.forward_sign_date || null, b.backward_contract_code || '', b.backward_contract_name || '',
        b.backward_unit_name || '', Number(b.backward_contract_amount || 0), b.backward_sign_date || null,
        b.income_type || '', b.net_or_full || '', b.milestone || '', b.next_milestone || '', b.next_milestone_date || null,
        b.progress || '', b.delay_extension || '', Number(b.delay_days || 0),
        Number(b.amount || 0), Number(b.paid || 0), b.risk || 'green', b.stage || '启动',
        b.type || '', b.sign_date || null, b.deadline || null, b.pm || '陈志远', b.remark || '', now(), now());
    seedDocFolders(id);
    res.json(deriveProject(project(id)));
  });

  app.put('/api/projects/:id', requireAuth, requireWrite('project'), (req, res) => {
    const p = project(req.params.id);
    if (!p) return sendError(res, 404, '项目不存在');
    const b = req.body || {};
    db.prepare(`UPDATE projects SET name=?, project_no=?, group_opportunity_code=?, approval_complete_date=?, start_date=?, expected_acceptance_date=?, sign_archive_date=?, our_unit=?, unit=?, customer_name=?, forward_contract_code=?, forward_contract_name=?, forward_contract_amount=?, forward_sign_date=?, backward_contract_code=?, backward_contract_name=?, backward_unit_name=?, backward_contract_amount=?, backward_sign_date=?, income_type=?, net_or_full=?, milestone=?, next_milestone=?, next_milestone_date=?, progress=?, delay_extension=?, delay_days=?, amount=?, paid=?, risk=?, stage=?, type=?, sign_date=?, deadline=?, pm=?, remark=?, updated_at=?
      WHERE id=?`)
      .run(b.name ?? p.name, b.project_no ?? p.project_no, b.group_opportunity_code ?? p.group_opportunity_code,
        b.approval_complete_date ?? p.approval_complete_date, b.start_date ?? p.start_date,
        b.expected_acceptance_date ?? p.expected_acceptance_date, b.sign_archive_date ?? p.sign_archive_date,
        b.our_unit ?? p.our_unit, b.unit ?? p.unit, b.customer_name ?? p.customer_name,
        b.forward_contract_code ?? p.forward_contract_code, b.forward_contract_name ?? p.forward_contract_name,
        Number(b.forward_contract_amount ?? p.forward_contract_amount), b.forward_sign_date ?? p.forward_sign_date,
        b.backward_contract_code ?? p.backward_contract_code, b.backward_contract_name ?? p.backward_contract_name,
        b.backward_unit_name ?? p.backward_unit_name, Number(b.backward_contract_amount ?? p.backward_contract_amount),
        b.backward_sign_date ?? p.backward_sign_date,
        b.income_type ?? p.income_type, b.net_or_full ?? p.net_or_full, b.milestone ?? p.milestone,
        b.next_milestone ?? p.next_milestone, b.next_milestone_date ?? p.next_milestone_date, b.progress ?? p.progress,
        b.delay_extension ?? p.delay_extension, Number(b.delay_days ?? p.delay_days),
        Number(b.amount ?? p.amount), Number(b.paid ?? p.paid),
        b.risk ?? p.risk, b.stage ?? p.stage, b.type ?? p.type, b.sign_date ?? p.sign_date, b.deadline ?? p.deadline,
        b.pm ?? p.pm, b.remark ?? p.remark, now(), req.params.id);
    res.json(deriveProject(project(req.params.id)));
  });

  app.delete('/api/projects/:id', requireAuth, requireWrite('project'), (req, res) => {
    const p = project(req.params.id);
    if (!p) return sendError(res, 404, '项目不存在');
    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ---------------- project batch import ----------------
  const IMPORT_COLUMNS = [
    ['name', '项目名称'], ['project_no', '项目编号'], ['group_opportunity_code', '集团商机编码'], ['approval_complete_date', '立项完成时间'],
    ['amount', '项目金额(万)'], ['start_date', '开工时间'], ['expected_acceptance_date', '预计终验时间'], ['sign_archive_date', '签约归档时间'],
    ['our_unit', '我方单位'], ['customer_name', '客户名称'], ['unit', '对方单位'], ['type', '项目类型'],
    ['stage', '阶段'], ['risk', '风险'], ['sign_date', '签约日期'], ['deadline', '截止日期'], ['pm', '项目经理'], ['remark', '备注'],
    ['forward_contract_code', '前向合同编码'], ['forward_contract_name', '前向合同名称'], ['forward_contract_amount', '前向签约金额(万)'], ['forward_sign_date', '前向签约时间'],
    ['backward_contract_code', '后向合同编码'], ['backward_contract_name', '后向合同名称'], ['backward_unit_name', '后向单位名称'], ['backward_contract_amount', '后向签约金额(万)'], ['backward_sign_date', '后向签约时间']
  ];

  app.get('/api/project-import-template', requireAuth, async (req, res) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('项目导入模板');
    ws.columns = IMPORT_COLUMNS.map(([key, header]) => ({ header, key, width: 20 }));
    ws.addRow({
      name: '示例：智慧园区智能化改造', project_no: 'XM-2026-099', group_opportunity_code: 'SJ-2026-0099',
      approval_complete_date: '2026-08-01', amount: 1000, start_date: '2026-08-10', expected_acceptance_date: '2027-03-31',
      sign_archive_date: '2027-04-15', our_unit: '江苏智联科技有限公司', customer_name: 'XX单位', unit: 'XX单位',
      type: '系统集成', stage: '启动', risk: 'green', sign_date: '2026-08-01', deadline: '2027-03-31', pm: '陈志远', remark: '',
      forward_contract_code: 'FW-2026-099', forward_contract_name: '示例合同', forward_contract_amount: 1000, forward_sign_date: '2026-08-01',
      backward_contract_code: 'HW-2026-099', backward_contract_name: '示例后向合同', backward_unit_name: 'XX供应商', backward_contract_amount: 600, backward_sign_date: '2026-08-02'
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="pms-project-import-template.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  });

  function cellToDate(v) {
    if (v instanceof Date) {
      const p = (n) => String(n).padStart(2, '0');
      return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
    }
    const s = String(v == null ? '' : v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(s)) {
      const parts = s.slice(0, 10).split('/');
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    return s;
  }

  app.post('/api/projects/import', requireAuth, requireWrite('project'), upload.single('file'), async (req, res) => {
    if (!req.file) return sendError(res, 400, '请选择 Excel 文件');
    const wb = new ExcelJS.Workbook();
    let ws;
    try {
      await wb.xlsx.readFile(req.file.path);
      ws = wb.worksheets[0];
    } catch (e) {
      return sendError(res, 400, '文件解析失败，请使用模板格式的 xlsx 文件');
    }
    const headers = {};
    const rows = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell((cell, col) => {
          const text = String(cell.value == null ? '' : cell.value).trim();
          const colDef = IMPORT_COLUMNS.find(([, h]) => h === text);
          if (colDef) headers[col] = colDef[0];
        });
        return;
      }
      const obj = {};
      row.eachCell((cell, col) => {
        if (headers[col]) obj[headers[col]] = cell.value;
      });
      if (Object.keys(obj).length) rows.push(obj);
    });
    const result = { total: rows.length, success: 0, failed: [] };
    const insert = db.prepare(`INSERT INTO projects(id,name,project_no,group_opportunity_code,approval_complete_date,start_date,expected_acceptance_date,sign_archive_date,our_unit,unit,customer_name,forward_contract_code,forward_contract_name,forward_contract_amount,forward_sign_date,backward_contract_code,backward_contract_name,backward_unit_name,backward_contract_amount,backward_sign_date,amount,paid,risk,stage,type,sign_date,deadline,pm,remark,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNo = i + 2;
      const name = String(row.name == null ? '' : row.name).trim();
      if (!name) { result.failed.push({ row: lineNo, reason: '项目名称为空' }); continue; }
      const projectNo = String(row.project_no == null ? '' : row.project_no).trim();
      if (projectNo && db.prepare('SELECT id FROM projects WHERE project_no = ?').get(projectNo)) {
        result.failed.push({ row: lineNo, reason: `项目编号 ${projectNo} 已存在，已跳过` });
        continue;
      }
      const id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36) + i;
      const s = (v) => String(v == null ? '' : v).trim();
      try {
        insert.run(id, name, projectNo, s(row.group_opportunity_code), cellToDate(row.approval_complete_date), cellToDate(row.start_date),
          cellToDate(row.expected_acceptance_date), cellToDate(row.sign_archive_date), s(row.our_unit), s(row.unit), s(row.customer_name) || s(row.unit),
          s(row.forward_contract_code), s(row.forward_contract_name), Number(row.forward_contract_amount || 0), cellToDate(row.forward_sign_date),
          s(row.backward_contract_code), s(row.backward_contract_name), s(row.backward_unit_name), Number(row.backward_contract_amount || 0), cellToDate(row.backward_sign_date),
          Number(row.amount || 0), 0, ['red', 'yellow', 'green'].includes(s(row.risk)) ? s(row.risk) : 'green',
          ['启动', '实施', '收尾'].includes(s(row.stage)) ? s(row.stage) : '启动', s(row.type),
          cellToDate(row.sign_date), cellToDate(row.deadline), s(row.pm) || '陈志远', s(row.remark), now(), now());
        seedDocFolders(id);
        result.success++;
      } catch (e) {
        result.failed.push({ row: lineNo, reason: e.message || '写入失败' });
      }
    }
    res.json(result);
  });

  // ---------------- fund in ----------------
  app.get('/api/projects/:id/fund-in', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM fund_in WHERE project_id = ? ORDER BY plan_date, id').all(req.params.id).map(deriveFund);
    res.json(rows);
  });

  app.post('/api/projects/:id/fund-in', requireAuth, requireWrite('fund'), (req, res) => {
    const b = req.body || {};
    if (!b.name) return sendError(res, 400, '款项名称不能为空');
    const r = db.prepare(`INSERT INTO fund_in(project_id,name,cond,ratio,amount,plan_date,recv_date,invoice,status,files,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(req.params.id, b.name, b.cond || '', Number(b.ratio || 0), Number(b.amount || 0), b.plan_date || null, b.recv_date || null,
        b.invoice || '', b.status || 'planned', JSON.stringify(b.files || []), now(), now());
    res.json(deriveFund(db.prepare('SELECT * FROM fund_in WHERE id = ?').get(Number(r.lastInsertRowid))));
  });

  app.put('/api/fund-in/:id', requireAuth, requireWrite('fund'), (req, res) => {
    const cur = db.prepare('SELECT * FROM fund_in WHERE id = ?').get(Number(req.params.id));
    if (!cur) return sendError(res, 404, '记录不存在');
    const b = req.body || {};
    db.prepare(`UPDATE fund_in SET name=?, cond=?, ratio=?, amount=?, plan_date=?, recv_date=?, invoice=?, status=?, files=?, updated_at=? WHERE id=?`)
      .run(b.name ?? cur.name, b.cond ?? cur.cond, Number(b.ratio ?? cur.ratio), Number(b.amount ?? cur.amount),
        b.plan_date ?? cur.plan_date, b.recv_date ?? cur.recv_date, b.invoice ?? cur.invoice, b.status ?? cur.status,
        JSON.stringify(b.files ?? safeJson(cur.files, [])), now(), cur.id);
    res.json(deriveFund(db.prepare('SELECT * FROM fund_in WHERE id = ?').get(cur.id)));
  });

  app.delete('/api/fund-in/:id', requireAuth, requireWrite('fund'), (req, res) => {
    db.prepare('DELETE FROM fund_in WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // ---------------- fund out ----------------
  app.get('/api/projects/:id/fund-out', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM fund_out WHERE project_id = ? ORDER BY plan_date, id').all(req.params.id).map(deriveFund);
    res.json(rows);
  });

  app.post('/api/projects/:id/fund-out', requireAuth, requireWrite('fund'), (req, res) => {
    const b = req.body || {};
    if (!b.name) return sendError(res, 400, '款项名称不能为空');
    const r = db.prepare(`INSERT INTO fund_out(project_id,contract_id,name,cond,ratio,amount,plan_date,recv_date,invoice,status,files,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(req.params.id, b.contract_id || null, b.name, b.cond || '', Number(b.ratio || 0), Number(b.amount || 0),
        b.plan_date || null, b.recv_date || null, b.invoice || '', b.status || 'planned', JSON.stringify(b.files || []), now(), now());
    res.json(deriveFund(db.prepare('SELECT * FROM fund_out WHERE id = ?').get(Number(r.lastInsertRowid))));
  });

  app.put('/api/fund-out/:id', requireAuth, requireWrite('fund'), (req, res) => {
    const cur = db.prepare('SELECT * FROM fund_out WHERE id = ?').get(Number(req.params.id));
    if (!cur) return sendError(res, 404, '记录不存在');
    const b = req.body || {};
    db.prepare(`UPDATE fund_out SET contract_id=?, name=?, cond=?, ratio=?, amount=?, plan_date=?, recv_date=?, invoice=?, status=?, files=?, updated_at=? WHERE id=?`)
      .run(b.contract_id ?? cur.contract_id, b.name ?? cur.name, b.cond ?? cur.cond, Number(b.ratio ?? cur.ratio), Number(b.amount ?? cur.amount),
        b.plan_date ?? cur.plan_date, b.recv_date ?? cur.recv_date, b.invoice ?? cur.invoice, b.status ?? cur.status,
        JSON.stringify(b.files ?? safeJson(cur.files, [])), now(), cur.id);
    res.json(deriveFund(db.prepare('SELECT * FROM fund_out WHERE id = ?').get(cur.id)));
  });

  app.delete('/api/fund-out/:id', requireAuth, requireWrite('fund'), (req, res) => {
    db.prepare('DELETE FROM fund_out WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // ---------------- sub contracts ----------------
  app.get('/api/projects/:id/sub-contracts', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT * FROM sub_contracts WHERE project_id = ? ORDER BY id').all(req.params.id));
  });

  app.post('/api/projects/:id/sub-contracts', requireAuth, requireWrite('fund'), (req, res) => {
    const b = req.body || {};
    if (!b.name) return sendError(res, 400, '合同名称不能为空');
    const r = db.prepare(`INSERT INTO sub_contracts(project_id,name,supplier,signable,signed,paid,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?)`)
      .run(req.params.id, b.name, b.supplier || '', Number(b.signable || 0), Number(b.signed || 0), Number(b.paid || 0), now(), now());
    res.json(db.prepare('SELECT * FROM sub_contracts WHERE id = ?').get(Number(r.lastInsertRowid)));
  });

  app.put('/api/sub-contracts/:id', requireAuth, requireWrite('fund'), (req, res) => {
    const cur = db.prepare('SELECT * FROM sub_contracts WHERE id = ?').get(Number(req.params.id));
    if (!cur) return sendError(res, 404, '合同不存在');
    const b = req.body || {};
    db.prepare(`UPDATE sub_contracts SET name=?, supplier=?, signable=?, signed=?, paid=?, updated_at=? WHERE id=?`)
      .run(b.name ?? cur.name, b.supplier ?? cur.supplier, Number(b.signable ?? cur.signable), Number(b.signed ?? cur.signed), Number(b.paid ?? cur.paid), now(), cur.id);
    res.json(db.prepare('SELECT * FROM sub_contracts WHERE id = ?').get(cur.id));
  });

  app.delete('/api/sub-contracts/:id', requireAuth, requireWrite('fund'), (req, res) => {
    db.prepare('DELETE FROM sub_contracts WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // ---------------- finance summary ----------------
  app.get('/api/projects/:id/finance', requireAuth, (req, res) => {
    const p = project(req.params.id);
    if (!p) return sendError(res, 404, '项目不存在');
    const fundIn = db.prepare('SELECT * FROM fund_in WHERE project_id = ? ORDER BY plan_date, id').all(req.params.id).map(deriveFund);
    const fundOut = db.prepare('SELECT * FROM fund_out WHERE project_id = ? ORDER BY plan_date, id').all(req.params.id).map(deriveFund);
    const contracts = db.prepare('SELECT * FROM sub_contracts WHERE project_id = ? ORDER BY id').all(req.params.id);
    const inTotal = fundIn.reduce((s, f) => s + (f.amount || 0), 0);
    const inReceived = fundIn.filter((f) => f.recv_date).reduce((s, f) => s + (f.amount || 0), 0);
    const outTotal = fundOut.reduce((s, f) => s + (f.amount || 0), 0);
    const outPaid = fundOut.filter((f) => f.recv_date).reduce((s, f) => s + (f.amount || 0), 0);
    const signable = contracts.reduce((s, c) => s + (c.signable || 0), 0);
    const signed = contracts.reduce((s, c) => s + (c.signed || 0), 0);
    const signedUnpaid = contracts.reduce((s, c) => s + ((c.signed || 0) - (c.paid || 0)), 0);
    res.json({
      project: deriveProject(p),
      fundIn, fundOut, contracts,
      totals: {
        inTotal: Math.round(inTotal * 100) / 100,
        inReceived: Math.round(inReceived * 100) / 100,
        outTotal: Math.round(outTotal * 100) / 100,
        outPaid: Math.round(outPaid * 100) / 100,
        signable: Math.round(signable * 100) / 100,
        signed: Math.round(signed * 100) / 100,
        signedUnpaid: Math.round(signedUnpaid * 100) / 100,
        remainingSignable: Math.round((p.amount - signed) * 100) / 100
      }
    });
  });

  // ---------------- contract management ----------------
  app.get('/api/contracts', requireAuth, (req, res) => {
    const direction = req.query.direction || '';
    const projectId = req.query.projectId || '';
    let forward;
    if (projectId) {
      forward = db.prepare(`SELECT id, name, project_no, customer_name, unit, forward_contract_code, forward_contract_name,
        forward_contract_amount, forward_sign_date, stage, risk FROM projects WHERE id = ?`).all(projectId);
    } else {
      forward = db.prepare(`SELECT id, name, project_no, customer_name, unit, forward_contract_code, forward_contract_name,
        forward_contract_amount, forward_sign_date, stage, risk FROM projects`).all();
    }
    const mapped = forward
      .map((p) => ({
        id: `f-${p.id}`,
        direction: 'forward',
        code: p.forward_contract_code || p.project_no || p.id,
        name: p.forward_contract_name || `${p.name}合同`,
        partner: p.customer_name || p.unit || '',
        amount: p.forward_contract_amount || p.amount,
        sign_date: p.forward_sign_date || '',
        project_id: p.id,
        project_name: p.name,
        stage: p.stage,
        risk: p.risk
      }));
    const backward = (projectId
      ? db.prepare(`SELECT s.*, p.name AS project_name FROM sub_contracts s LEFT JOIN projects p ON p.id = s.project_id WHERE s.project_id = ? ORDER BY s.id`).all(projectId)
      : db.prepare(`SELECT s.*, p.name AS project_name FROM sub_contracts s LEFT JOIN projects p ON p.id = s.project_id ORDER BY s.id`).all())
      .map((c) => ({
        id: `b-${c.id}`,
        direction: 'backward',
        code: c.code || '',
        name: c.name,
        partner: c.supplier || '',
        amount: c.signable,
        signed: c.signed,
        paid: c.paid,
        sign_date: c.sign_date || '',
        project_id: c.project_id,
        project_name: c.project_name || '',
        stage: '',
        risk: '',
        rawId: c.id
      }));
    let list = [...mapped, ...backward];
    if (direction === 'forward') list = mapped;
    if (direction === 'backward') list = backward;
    res.json(list);
  });

  app.get('/api/contracts/plans', requireAuth, (req, res) => {
    const projectId = req.query.projectId || '';
    const inRows = (projectId
      ? db.prepare(`SELECT f.*, p.name AS project_name FROM fund_in f LEFT JOIN projects p ON p.id = f.project_id WHERE f.project_id = ? ORDER BY f.plan_date, f.id`).all(projectId)
      : db.prepare(`SELECT f.*, p.name AS project_name FROM fund_in f LEFT JOIN projects p ON p.id = f.project_id ORDER BY f.plan_date, f.id`).all())
      .map((f) => ({ ...deriveFund(f), direction: 'forward', contract: '前向回款' }));
    const outRows = (projectId
      ? db.prepare(`SELECT f.*, p.name AS project_name FROM fund_out f LEFT JOIN projects p ON p.id = f.project_id WHERE f.project_id = ? ORDER BY f.plan_date, f.id`).all(projectId)
      : db.prepare(`SELECT f.*, p.name AS project_name FROM fund_out f LEFT JOIN projects p ON p.id = f.project_id ORDER BY f.plan_date, f.id`).all())
      .map((f) => ({ ...deriveFund(f), direction: 'backward', contract: '后向支付' }));
    res.json([...inRows, ...outRows]);
  });

  app.post('/api/contracts/backward', requireAuth, requireWrite('contract'), (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.project_id) return sendError(res, 400, '合同名称和关联项目不能为空');
    const r = db.prepare(`INSERT INTO sub_contracts(project_id,code,name,supplier,signable,signed,paid,sign_date,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run(b.project_id, b.code || '', b.name, b.supplier || '', Number(b.signable || 0), Number(b.signed || 0), Number(b.paid || 0), b.sign_date || null, now(), now());
    res.json(db.prepare('SELECT * FROM sub_contracts WHERE id = ?').get(Number(r.lastInsertRowid)));
  });

  app.put('/api/contracts/backward/:id', requireAuth, requireWrite('contract'), (req, res) => {
    const cur = db.prepare('SELECT * FROM sub_contracts WHERE id = ?').get(Number(req.params.id));
    if (!cur) return sendError(res, 404, '合同不存在');
    const b = req.body || {};
    db.prepare(`UPDATE sub_contracts SET code=?, name=?, supplier=?, signable=?, signed=?, paid=?, sign_date=?, updated_at=? WHERE id=?`)
      .run(b.code ?? cur.code, b.name ?? cur.name, b.supplier ?? cur.supplier, Number(b.signable ?? cur.signable),
        Number(b.signed ?? cur.signed), Number(b.paid ?? cur.paid), b.sign_date ?? cur.sign_date, now(), cur.id);
    res.json(db.prepare('SELECT * FROM sub_contracts WHERE id = ?').get(cur.id));
  });

  app.delete('/api/contracts/backward/:id', requireAuth, requireWrite('contract'), (req, res) => {
    db.prepare('DELETE FROM sub_contracts WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  app.put('/api/contracts/forward/:projectId', requireAuth, requireWrite('contract'), (req, res) => {
    const p = project(req.params.projectId);
    if (!p) return sendError(res, 404, '项目不存在');
    const b = req.body || {};
    db.prepare(`UPDATE projects SET forward_contract_code=?, forward_contract_name=?, forward_contract_amount=?, forward_sign_date=?, updated_at=? WHERE id=?`)
      .run(b.forward_contract_code ?? p.forward_contract_code, b.forward_contract_name ?? p.forward_contract_name,
        Number(b.forward_contract_amount ?? p.forward_contract_amount), b.forward_sign_date ?? p.forward_sign_date, now(), p.id);
    res.json(deriveProject(project(p.id)));
  });

  // ---------------- document folders ----------------
  app.get('/api/projects/:id/folders', requireAuth, (req, res) => {
    const flat = db.prepare('SELECT * FROM doc_folders WHERE project_id = ? ORDER BY sort_order, id').all(req.params.id);
    const top = flat.filter((f) => !f.parent_id);
    res.json(top.map((f) => ({
      ...f,
      children: flat.filter((c) => c.parent_id === f.id)
    })));
  });

  app.post('/api/projects/:id/folders', requireAuth, requireWrite('doc'), (req, res) => {
    const b = req.body || {};
    if (!b.name) return sendError(res, 400, '目录名称不能为空');
    const sort = db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 AS s FROM doc_folders WHERE project_id = ? AND parent_id IS ?').get(req.params.id, b.parent_id || null);
    const r = db.prepare('INSERT INTO doc_folders(project_id,parent_id,name,sort_order) VALUES(?,?,?,?)')
      .run(req.params.id, b.parent_id || null, b.name, Number(b.sort_order ?? sort.s));
    res.json(db.prepare('SELECT * FROM doc_folders WHERE id = ?').get(Number(r.lastInsertRowid)));
  });

  app.put('/api/folders/:id', requireAuth, requireWrite('doc'), (req, res) => {
    const cur = db.prepare('SELECT * FROM doc_folders WHERE id = ?').get(Number(req.params.id));
    if (!cur) return sendError(res, 404, '目录不存在');
    const b = req.body || {};
    db.prepare('UPDATE doc_folders SET name=?, parent_id=?, sort_order=? WHERE id=?')
      .run(b.name ?? cur.name, b.parent_id ?? cur.parent_id, Number(b.sort_order ?? cur.sort_order), cur.id);
    res.json(db.prepare('SELECT * FROM doc_folders WHERE id = ?').get(cur.id));
  });

  app.delete('/api/folders/:id', requireAuth, requireWrite('doc'), (req, res) => {
    const cur = db.prepare('SELECT * FROM doc_folders WHERE id = ?').get(Number(req.params.id));
    if (!cur) return sendError(res, 404, '目录不存在');
    // 删除子目录与文件
    const children = db.prepare('SELECT id FROM doc_folders WHERE parent_id = ?').all(cur.id);
    for (const c of children) {
      db.prepare('DELETE FROM doc_files WHERE folder_id = ?').run(c.id);
      db.prepare('DELETE FROM doc_folders WHERE id = ?').run(c.id);
    }
    db.prepare('DELETE FROM doc_files WHERE folder_id = ?').run(cur.id);
    db.prepare('DELETE FROM doc_folders WHERE id = ?').run(cur.id);
    res.json({ ok: true });
  });

  app.get('/api/folders/:id/files', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT * FROM doc_files WHERE folder_id = ? ORDER BY upload_time DESC').all(Number(req.params.id)));
  });

  app.post('/api/folders/:id/files', requireAuth, requireWrite('doc'), upload.single('file'), (req, res) => {
    const folder = db.prepare('SELECT * FROM doc_folders WHERE id = ?').get(Number(req.params.id));
    if (!folder) return sendError(res, 404, '目录不存在');
    const b = req.body || {};
    let name = b.name;
    let type = b.type || '';
    let size = 0;
    let filePath = null;
    if (req.file) {
      name = name || Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      type = type || (path.extname(req.file.originalname) || '').replace('.', '') || 'file';
      size = req.file.size;
      filePath = req.file.filename;
    } else if (b.name) {
      name = b.name;
      type = type || 'md';
    } else {
      return sendError(res, 400, '缺少文件名');
    }
    const r = db.prepare(`INSERT INTO doc_files(project_id,folder_id,name,type,size,upload_time,note,ai_generated,archived,path)
      VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run(folder.project_id, folder.id, name, type, size, now(), b.note || '', b.ai_generated ? 1 : 0, b.archived ? 1 : 0, filePath);
    res.json(db.prepare('SELECT * FROM doc_files WHERE id = ?').get(Number(r.lastInsertRowid)));
  });

  app.put('/api/doc-files/:id', requireAuth, requireWrite('doc'), (req, res) => {
    const cur = db.prepare('SELECT * FROM doc_files WHERE id = ?').get(Number(req.params.id));
    if (!cur) return sendError(res, 404, '文件不存在');
    const b = req.body || {};
    db.prepare('UPDATE doc_files SET name=?, note=?, archived=?, type=? WHERE id=?')
      .run(b.name ?? cur.name, b.note ?? cur.note, b.archived === undefined ? cur.archived : (b.archived ? 1 : 0), b.type ?? cur.type, cur.id);
    res.json(db.prepare('SELECT * FROM doc_files WHERE id = ?').get(cur.id));
  });

  app.delete('/api/doc-files/:id', requireAuth, requireWrite('doc'), (req, res) => {
    const cur = db.prepare('SELECT * FROM doc_files WHERE id = ?').get(Number(req.params.id));
    if (cur && cur.path) {
      const p = path.join(UPLOAD_DIR, cur.path);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    db.prepare('DELETE FROM doc_files WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  app.post('/api/projects/:id/folders/init', requireAuth, requireWrite('doc'), (req, res) => {
    db.prepare('DELETE FROM doc_files WHERE project_id = ?').run(req.params.id);
    db.prepare('DELETE FROM doc_folders WHERE project_id = ?').run(req.params.id);
    seedDocFolders(req.params.id);
    res.json({ ok: true });
  });

  // ---------------- attachments ----------------
  app.post('/api/attachments', requireAuth, requireWrite('doc'), upload.single('file'), (req, res) => {
    if (!req.file) return sendError(res, 400, '请选择文件');
    const b = req.body || {};
    const original = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const r = db.prepare(`INSERT INTO attachments(biz_type,biz_id,file_name,file_type,size,upload_time,uploader,path)
      VALUES(?,?,?,?,?,?,?,?)`)
      .run(b.biz_type || 'other', b.biz_id || '', original, (path.extname(req.file.originalname) || '').replace('.', ''), req.file.size, now(), req.user ? req.user.name : '', req.file.filename);
    res.json(db.prepare('SELECT * FROM attachments WHERE id = ?').get(Number(r.lastInsertRowid)));
  });

  app.get('/api/attachments', requireAuth, (req, res) => {
    let rows;
    if (req.query.biz_type && req.query.biz_id) {
      rows = db.prepare('SELECT * FROM attachments WHERE biz_type = ? AND biz_id = ? ORDER BY upload_time DESC').all(req.query.biz_type, req.query.biz_id);
    } else {
      rows = db.prepare('SELECT * FROM attachments ORDER BY upload_time DESC').all();
    }
    res.json(rows);
  });

  app.get('/api/attachments/:id/download', requireAuth, (req, res) => {
    const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(Number(req.params.id));
    if (!a) return sendError(res, 404, '附件不存在');
    const p = path.join(UPLOAD_DIR, a.path);
    if (!fs.existsSync(p)) return sendError(res, 404, '文件已丢失');
    res.download(p, a.file_name);
  });

  app.delete('/api/attachments/:id', requireAuth, requireWrite('doc'), (req, res) => {
    const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(Number(req.params.id));
    if (a && a.path) {
      const p = path.join(UPLOAD_DIR, a.path);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    db.prepare('DELETE FROM attachments WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // ---------------- reminders ----------------
  app.get('/api/reminders', requireAuth, (req, res) => {
    const items = computeReminders();
    res.json(items);
  });

  app.get('/api/remind-rules', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT * FROM remind_rules ORDER BY id').all().map((r) => ({ ...r, channels: safeJson(r.channels, []) })));
  });

  app.put('/api/remind-rules/:id', requireAuth, requireWrite('remind'), (req, res) => {
    const cur = db.prepare('SELECT * FROM remind_rules WHERE id = ?').get(Number(req.params.id));
    if (!cur) return sendError(res, 404, '规则不存在');
    const b = req.body || {};
    db.prepare('UPDATE remind_rules SET enabled=?, channels=?, trigger_desc=? WHERE id=?')
      .run(b.enabled === undefined ? cur.enabled : (b.enabled ? 1 : 0),
        JSON.stringify(b.channels ?? safeJson(cur.channels, [])), b.trigger_desc ?? cur.trigger_desc, cur.id);
    res.json(db.prepare('SELECT * FROM remind_rules WHERE id = ?').get(cur.id));
  });

  // ---------------- PMO management ----------------
  app.get('/api/pmo/summary', requireAuth, (req, res) => {
    const members = db.prepare('SELECT id, username, name, role, created_at FROM users ORDER BY id').all();
    const projects = db.prepare('SELECT * FROM projects').all().map(deriveProject);
    const byPmMap = {};
    for (const p of projects) {
      const pm = p.pm || '未分配';
      if (!byPmMap[pm]) byPmMap[pm] = { pm, count: 0, riskCount: 0, totalAmount: 0, paid: 0, projects: [] };
      byPmMap[pm].count++;
      if (p.risk === 'red') byPmMap[pm].riskCount++;
      byPmMap[pm].totalAmount += p.amount || 0;
      byPmMap[pm].paid += p.paid || 0;
      byPmMap[pm].projects.push({ id: p.id, name: p.name, stage: p.stage, risk: p.risk, deadline: p.deadline });
    }
    const byPm = Object.values(byPmMap).map((x) => ({
      ...x,
      totalAmount: Math.round(x.totalAmount * 100) / 100,
      avgRatio: x.totalAmount > 0 ? Math.round(x.paid / x.totalAmount * 10000) / 100 : 0
    }));
    const risks = projects.filter((p) => p.risk !== 'green').map((p) => ({ id: p.id, name: p.name, risk: p.risk, remark: p.remark, pm: p.pm }));
    const t = today();
    const ms = db.prepare('SELECT * FROM project_milestones ORDER BY project_id, seq').all()
      .map((m) => ({ ...m, docs: safeJson(m.docs, []) }));
    const overdueMs = ms.filter((m) => m.status !== 'done' && m.due_date && m.due_date < t)
      .map((m) => { const p = project(m.project_id); return { ...m, project_name: p ? p.name : '' }; });
    const upcomingMs = ms.filter((m) => m.status !== 'done' && m.due_date && m.due_date >= t && m.due_date <= addDays(t, 14))
      .map((m) => { const p = project(m.project_id); return { ...m, project_name: p ? p.name : '' }; });
    const checks = db.prepare('SELECT c.*, p.name AS project_name FROM project_checks c LEFT JOIN projects p ON p.id = c.project_id ORDER BY c.created_at DESC').all();
    const audits = db.prepare('SELECT a.*, p.name AS project_name FROM project_audits a LEFT JOIN projects p ON p.id = a.project_id ORDER BY a.created_at DESC').all();
    const changes = db.prepare('SELECT c.*, p.name AS project_name FROM project_changes c LEFT JOIN projects p ON p.id = c.project_id ORDER BY c.created_at DESC').all();
    const overdue180 = projects.filter((p) => p.deadline && p.deadline < addDays(t, -180));
    const debt = projects.filter((p) => (p.amount || 0) - (p.paid || 0) > 0)
      .map((p) => ({ ...p, debt: Math.round((p.amount - p.paid) * 100) / 100 }));
    const eightTables = {
      t1: projects.filter((p) => p.amount >= 100 && p.amount < 500),
      t2: projects.filter((p) => p.amount >= 500),
      t3: overdue180,
      t4: checks,
      t5: audits,
      t6: projects.map((p) => ({ id: p.id, name: p.name, unit: p.customer_name || p.unit, pm: p.pm, amount: p.amount, income_type: p.income_type, net_or_full: p.net_or_full, milestone: p.milestone, next_milestone: p.next_milestone, next_milestone_date: p.next_milestone_date, deadline: p.deadline })),
      t7: debt,
      t8: changes
    };
    res.json({
      members, byPm, risks,
      milestones: ms,
      overdueMilestones: overdueMs,
      upcomingMilestones: upcomingMs,
      checks, audits, changes, eightTables,
      totals: {
        projectCount: projects.length,
        riskCount: projects.filter((p) => p.risk === 'red').length,
        totalAmount: Math.round(projects.reduce((s, p) => s + (p.amount || 0), 0) * 100) / 100,
        millionCount: projects.filter((p) => p.amount >= 100).length,
        over500Count: projects.filter((p) => p.amount >= 500).length,
        overdue180Count: overdue180.length,
        debtTotal: Math.round(debt.reduce((s, p) => s + p.debt, 0) * 100) / 100,
        auditPending: audits.filter((a) => a.status === '待送审').length,
        checkPending: checks.filter((c) => c.result !== '通过').length
      }
    });
  });

  // 项目里程碑
  app.get('/api/projects/:id/milestones', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT * FROM project_milestones WHERE project_id = ? ORDER BY seq').all(req.params.id).map((m) => ({ ...m, docs: safeJson(m.docs, []) })));
  });

  app.put('/api/milestones/:id', requireAuth, requireWrite('project'), (req, res) => {
    const cur = db.prepare('SELECT * FROM project_milestones WHERE id = ?').get(Number(req.params.id));
    if (!cur) return sendError(res, 404, '里程碑不存在');
    const b = req.body || {};
    db.prepare('UPDATE project_milestones SET status=?, done_date=?, due_date=?, note=?, updated_at=? WHERE id=?')
      .run(b.status ?? cur.status, b.done_date ?? cur.done_date, b.due_date ?? cur.due_date, b.note ?? cur.note, now(), cur.id);
    res.json(db.prepare('SELECT * FROM project_milestones WHERE id = ?').get(cur.id));
  });

  // 质量检查
  app.get('/api/pmo/checks', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT c.*, p.name AS project_name FROM project_checks c LEFT JOIN projects p ON p.id = c.project_id ORDER BY c.created_at DESC').all());
  });
  app.post('/api/pmo/checks', requireAuth, requireWrite('project'), (req, res) => {
    const b = req.body || {};
    if (!b.project_id || !b.item) return sendError(res, 400, '项目与检查项不能为空');
    const r = db.prepare('INSERT INTO project_checks(project_id,category,item,result,remark,checked_by,checked_at) VALUES(?,?,?,?,?,?,?)')
      .run(b.project_id, b.category || '', b.item, b.result || '待检查', b.remark || '', req.user ? req.user.name : '', now());
    res.json(db.prepare('SELECT * FROM project_checks WHERE id = ?').get(Number(r.lastInsertRowid)));
  });
  app.put('/api/pmo/checks/:id', requireAuth, requireWrite('project'), (req, res) => {
    const cur = db.prepare('SELECT * FROM project_checks WHERE id = ?').get(Number(req.params.id));
    if (!cur) return sendError(res, 404, '检查记录不存在');
    const b = req.body || {};
    db.prepare('UPDATE project_checks SET category=?, item=?, result=?, remark=?, checked_by=?, checked_at=? WHERE id=?')
      .run(b.category ?? cur.category, b.item ?? cur.item, b.result ?? cur.result, b.remark ?? cur.remark,
        req.user ? req.user.name : cur.checked_by, now(), cur.id);
    res.json(db.prepare('SELECT * FROM project_checks WHERE id = ?').get(cur.id));
  });
  app.delete('/api/pmo/checks/:id', requireAuth, requireWrite('project'), (req, res) => {
    db.prepare('DELETE FROM project_checks WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // 送审进度
  app.get('/api/pmo/audits', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT a.*, p.name AS project_name FROM project_audits a LEFT JOIN projects p ON p.id = a.project_id ORDER BY a.created_at DESC').all());
  });
  app.post('/api/pmo/audits', requireAuth, requireWrite('project'), (req, res) => {
    const b = req.body || {};
    if (!b.project_id) return sendError(res, 400, '项目不能为空');
    const r = db.prepare('INSERT INTO project_audits(project_id,direction,audit_type,clause,plan_date,done_date,status,remark) VALUES(?,?,?,?,?,?,?,?)')
      .run(b.project_id, b.direction || 'forward', b.audit_type || '', b.clause || '', b.plan_date || null, b.done_date || null, b.status || '待送审', b.remark || '');
    res.json(db.prepare('SELECT * FROM project_audits WHERE id = ?').get(Number(r.lastInsertRowid)));
  });
  app.put('/api/pmo/audits/:id', requireAuth, requireWrite('project'), (req, res) => {
    const cur = db.prepare('SELECT * FROM project_audits WHERE id = ?').get(Number(req.params.id));
    if (!cur) return sendError(res, 404, '送审记录不存在');
    const b = req.body || {};
    db.prepare('UPDATE project_audits SET direction=?, audit_type=?, clause=?, plan_date=?, done_date=?, status=?, remark=? WHERE id=?')
      .run(b.direction ?? cur.direction, b.audit_type ?? cur.audit_type, b.clause ?? cur.clause, b.plan_date ?? cur.plan_date,
        b.done_date ?? cur.done_date, b.status ?? cur.status, b.remark ?? cur.remark, cur.id);
    res.json(db.prepare('SELECT * FROM project_audits WHERE id = ?').get(cur.id));
  });
  app.delete('/api/pmo/audits/:id', requireAuth, requireWrite('project'), (req, res) => {
    db.prepare('DELETE FROM project_audits WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // 变更台账
  app.get('/api/pmo/changes', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT c.*, p.name AS project_name FROM project_changes c LEFT JOIN projects p ON p.id = c.project_id ORDER BY c.created_at DESC').all());
  });
  app.post('/api/pmo/changes', requireAuth, requireWrite('project'), (req, res) => {
    const b = req.body || {};
    if (!b.project_id || !b.change_type) return sendError(res, 400, '项目与变更类型不能为空');
    const r = db.prepare('INSERT INTO project_changes(project_id,change_type,before_value,after_value,detail,changed_by) VALUES(?,?,?,?,?,?)')
      .run(b.project_id, b.change_type, b.before_value || '', b.after_value || '', b.detail || '', req.user ? req.user.name : '');
    res.json(db.prepare('SELECT * FROM project_changes WHERE id = ?').get(Number(r.lastInsertRowid)));
  });
  app.delete('/api/pmo/changes/:id', requireAuth, requireWrite('project'), (req, res) => {
    db.prepare('DELETE FROM project_changes WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  function addDays(d, days) {
    const date = new Date(d);
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  // ---------------- knowledge base ----------------
  app.get('/api/kb/categories', requireAuth, (req, res) => {
    const flat = db.prepare('SELECT * FROM kb_categories ORDER BY sort_order, id').all();
    const top = flat.filter((c) => !c.parent_id);
    res.json(top.map((c) => ({ ...c, children: flat.filter((x) => x.parent_id === c.id) })));
  });

  app.post('/api/kb/categories', requireAuth, requireWrite('kb'), (req, res) => {
    const b = req.body || {};
    if (!b.name) return sendError(res, 400, '分类名称不能为空');
    const r = db.prepare('INSERT INTO kb_categories(parent_id,name,sort_order) VALUES(?,?,?)')
      .run(b.parent_id || null, b.name, Number(b.sort_order || 0));
    res.json(db.prepare('SELECT * FROM kb_categories WHERE id = ?').get(Number(r.lastInsertRowid)));
  });

  app.put('/api/kb/categories/:id', requireAuth, requireWrite('kb'), (req, res) => {
    const cur = db.prepare('SELECT * FROM kb_categories WHERE id = ?').get(Number(req.params.id));
    if (!cur) return sendError(res, 404, '分类不存在');
    const b = req.body || {};
    db.prepare('UPDATE kb_categories SET name=?, sort_order=? WHERE id=?')
      .run(b.name ?? cur.name, Number(b.sort_order ?? cur.sort_order), cur.id);
    res.json(db.prepare('SELECT * FROM kb_categories WHERE id = ?').get(cur.id));
  });

  app.delete('/api/kb/categories/:id', requireAuth, requireWrite('kb'), (req, res) => {
    const id = Number(req.params.id);
    const children = db.prepare('SELECT id FROM kb_categories WHERE parent_id = ?').all(id);
    for (const c of children) {
      db.prepare('UPDATE kb_articles SET category_id = NULL WHERE category_id = ?').run(c.id);
      db.prepare('DELETE FROM kb_categories WHERE id = ?').run(c.id);
    }
    db.prepare('UPDATE kb_articles SET category_id = NULL WHERE category_id = ?').run(id);
    db.prepare('DELETE FROM kb_categories WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  app.get('/api/kb/articles', requireAuth, (req, res) => {
    const categoryId = req.query.categoryId;
    const q = String(req.query.q || '').trim();
    let rows;
    if (categoryId) {
      const cat = db.prepare('SELECT * FROM kb_categories WHERE id = ?').get(Number(categoryId));
      if (!cat) return res.json([]);
      const subIds = db.prepare('SELECT id FROM kb_categories WHERE parent_id = ?').all(cat.id).map((c) => c.id);
      const ids = [cat.id, ...subIds];
      const placeholders = ids.map(() => '?').join(',');
      rows = db.prepare(`SELECT * FROM kb_articles WHERE category_id IN (${placeholders}) ORDER BY updated_at DESC`).all(...ids);
    } else {
      rows = db.prepare('SELECT * FROM kb_articles ORDER BY updated_at DESC').all();
    }
    if (q) {
      rows = rows.filter((a) => (a.title + ' ' + a.content + ' ' + a.tags).toLowerCase().includes(q.toLowerCase()));
    }
    res.json(rows);
  });

  app.get('/api/kb/articles/:id', requireAuth, (req, res) => {
    const a = db.prepare('SELECT * FROM kb_articles WHERE id = ?').get(Number(req.params.id));
    if (!a) return sendError(res, 404, '文章不存在');
    res.json(a);
  });

  app.post('/api/kb/articles', requireAuth, requireWrite('kb'), (req, res) => {
    const b = req.body || {};
    if (!b.title) return sendError(res, 400, '标题不能为空');
    const r = db.prepare('INSERT INTO kb_articles(category_id,title,content,tags,author,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(b.category_id || null, b.title, b.content || '', b.tags || '', req.user ? req.user.name : '', now(), now());
    res.json(db.prepare('SELECT * FROM kb_articles WHERE id = ?').get(Number(r.lastInsertRowid)));
  });

  app.put('/api/kb/articles/:id', requireAuth, requireWrite('kb'), (req, res) => {
    const cur = db.prepare('SELECT * FROM kb_articles WHERE id = ?').get(Number(req.params.id));
    if (!cur) return sendError(res, 404, '文章不存在');
    const b = req.body || {};
    db.prepare('UPDATE kb_articles SET category_id=?, title=?, content=?, tags=?, updated_at=? WHERE id=?')
      .run(b.category_id ?? cur.category_id, b.title ?? cur.title, b.content ?? cur.content, b.tags ?? cur.tags, now(), cur.id);
    res.json(db.prepare('SELECT * FROM kb_articles WHERE id = ?').get(cur.id));
  });

  app.delete('/api/kb/articles/:id', requireAuth, requireWrite('kb'), (req, res) => {
    db.prepare('DELETE FROM kb_articles WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // ---------------- template management ----------------
  app.get('/api/templates', requireAuth, (req, res) => {
    const type = req.query.type;
    let rows;
    if (type) rows = db.prepare('SELECT * FROM templates WHERE type = ? ORDER BY updated_at DESC').all(type);
    else rows = db.prepare('SELECT * FROM templates ORDER BY type, updated_at DESC').all();
    res.json(rows);
  });

  app.post('/api/templates', requireAuth, requireWrite('template'), upload.single('file'), (req, res) => {
    const b = req.body || {};
    if (!b.name) return sendError(res, 400, '模板名称不能为空');
    let fileName = null, pathValue = null;
    if (req.file) {
      fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      pathValue = req.file.filename;
    }
    const r = db.prepare('INSERT INTO templates(type,name,description,file_name,path,version,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)')
      .run(b.type || 'doc', b.name, b.description || '', fileName, pathValue, now(), now());
    res.json(db.prepare('SELECT * FROM templates WHERE id = ?').get(Number(r.lastInsertRowid)));
  });

  app.put('/api/templates/:id', requireAuth, requireWrite('template'), upload.single('file'), (req, res) => {
    const cur = db.prepare('SELECT * FROM templates WHERE id = ?').get(Number(req.params.id));
    if (!cur) return sendError(res, 404, '模板不存在');
    const b = req.body || {};
    let fileName = cur.file_name, pathValue = cur.path, version = cur.version;
    if (req.file) {
      if (cur.path) {
        const old = path.join(UPLOAD_DIR, cur.path);
        if (fs.existsSync(old)) fs.unlinkSync(old);
      }
      fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      pathValue = req.file.filename;
      version = (cur.version || 0) + 1;
    }
    db.prepare('UPDATE templates SET type=?, name=?, description=?, file_name=?, path=?, version=?, updated_at=? WHERE id=?')
      .run(b.type ?? cur.type, b.name ?? cur.name, b.description ?? cur.description, fileName, pathValue, version, now(), cur.id);
    res.json(db.prepare('SELECT * FROM templates WHERE id = ?').get(cur.id));
  });

  app.delete('/api/templates/:id', requireAuth, requireWrite('template'), (req, res) => {
    const cur = db.prepare('SELECT * FROM templates WHERE id = ?').get(Number(req.params.id));
    if (cur && cur.path) {
      const p = path.join(UPLOAD_DIR, cur.path);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    db.prepare('DELETE FROM templates WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  app.get('/api/templates/:id/download', requireAuth, (req, res) => {
    const cur = db.prepare('SELECT * FROM templates WHERE id = ?').get(Number(req.params.id));
    if (!cur || !cur.path) return sendError(res, 404, '模板文件不存在');
    const p = path.join(UPLOAD_DIR, cur.path);
    if (!fs.existsSync(p)) return sendError(res, 404, '模板文件已丢失');
    res.download(p, cur.file_name);
  });

  // ---------------- AI config ----------------
  app.get('/api/ai/models', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT id,provider,name,endpoint,model,is_primary,enabled,created_at FROM ai_models ORDER BY id').all());
  });

  app.post('/api/ai/models', requireAuth, requireWrite('ai'), (req, res) => {
    const b = req.body || {};
    if (!b.provider || !b.name) return sendError(res, 400, '缺少供应商或名称');
    const r = db.prepare(`INSERT INTO ai_models(provider,name,api_key_enc,endpoint,model,is_primary,enabled,created_at)
      VALUES(?,?,?,?,?,?,?,?)`)
      .run(b.provider, b.name, b.apiKey ? encrypt(b.apiKey) : '', b.endpoint || '', b.model || '', b.is_primary ? 1 : 0, b.enabled === false ? 0 : 1, now());
    if (b.is_primary) db.prepare('UPDATE ai_models SET is_primary = 0 WHERE id != ?').run(Number(r.lastInsertRowid));
    res.json(db.prepare('SELECT id,provider,name,endpoint,model,is_primary,enabled,created_at FROM ai_models WHERE id = ?').get(Number(r.lastInsertRowid)));
  });

  app.put('/api/ai/models/:id', requireAuth, requireWrite('ai'), (req, res) => {
    const cur = db.prepare('SELECT * FROM ai_models WHERE id = ?').get(Number(req.params.id));
    if (!cur) return sendError(res, 404, '模型不存在');
    const b = req.body || {};
    db.prepare('UPDATE ai_models SET provider=?, name=?, endpoint=?, model=?, is_primary=?, enabled=? WHERE id=?')
      .run(b.provider ?? cur.provider, b.name ?? cur.name, b.endpoint ?? cur.endpoint, b.model ?? cur.model,
        b.is_primary === undefined ? cur.is_primary : (b.is_primary ? 1 : 0), b.enabled === undefined ? cur.enabled : (b.enabled ? 1 : 0), cur.id);
    if (b.apiKey) db.prepare('UPDATE ai_models SET api_key_enc = ? WHERE id = ?').run(encrypt(b.apiKey), cur.id);
    if (b.is_primary) db.prepare('UPDATE ai_models SET is_primary = 0 WHERE id != ?').run(cur.id);
    res.json(db.prepare('SELECT id,provider,name,endpoint,model,is_primary,enabled,created_at FROM ai_models WHERE id = ?').get(cur.id));
  });

  app.delete('/api/ai/models/:id', requireAuth, requireWrite('ai'), (req, res) => {
    db.prepare('DELETE FROM ai_models WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  app.get('/api/ai/capabilities', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT * FROM ai_capabilities ORDER BY id').all());
  });

  app.put('/api/ai/capabilities/:id', requireAuth, requireWrite('ai'), (req, res) => {
    const cur = db.prepare('SELECT * FROM ai_capabilities WHERE id = ?').get(Number(req.params.id));
    if (!cur) return sendError(res, 404, '能力不存在');
    const b = req.body || {};
    db.prepare('UPDATE ai_capabilities SET enabled=?, model_id=? WHERE id=?')
      .run(b.enabled === undefined ? cur.enabled : (b.enabled ? 1 : 0), b.model_id === undefined ? cur.model_id : (b.model_id || null), cur.id);
    res.json(db.prepare('SELECT * FROM ai_capabilities WHERE id = ?').get(cur.id));
  });

  app.get('/api/ai/logs', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT * FROM ai_call_logs ORDER BY id DESC LIMIT 100').all());
  });

  app.get('/api/ai/stats', requireAuth, (req, res) => {
    const total = db.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(duration_ms),0) AS ms FROM ai_call_logs').get();
    const ok = db.prepare('SELECT COUNT(*) AS c FROM ai_call_logs WHERE status = ?').get('success');
    const byCap = db.prepare('SELECT capability, COUNT(*) AS c FROM ai_call_logs GROUP BY capability ORDER BY c DESC').all();
    res.json({
      total: total.c || 0,
      success: ok.c || 0,
      avgMs: total.c ? Math.round(total.ms / total.c) : 0,
      byCap
    });
  });

  // ---------------- AI capabilities ----------------
  app.post('/api/ai/extract', requireAuth, async (req, res) => {
    const b = req.body || {};
    const sourceText = b.text || '';
    if (!sourceText) return sendError(res, 400, '请提供合同/标书文本');
    const prompt = `请从以下合同或标书文本中抽取字段，输出 JSON：projectName, amount, unit, duration, payment, remark。\n文本：\n${sourceText}`;
    const fallback = JSON.stringify(ai.mockExtract(sourceText), null, 2);
    const text = await ai.callModel('extract', prompt, fallback);
    let data;
    try {
      data = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      data = ai.mockExtract(sourceText);
    }
    res.json({ data, modelUsed: ai.capabilityConfig('extract') || null, disclaimer: 'AI 识别仅供参考，请以财务到账/付款凭证为准' });
  });

  app.post('/api/ai/risk-review', requireAuth, async (req, res) => {
    const b = req.body || {};
    const text = b.text || '';
    if (!text) return sendError(res, 400, '请提供合同文本');
    const prompt = `请对以下合同文本进行风险审核，输出 JSON：rating(red/yellow/green), summary, checklist[{item,result}]。固定清单：合同主体与签章完整性、付款条款与里程碑匹配、违约责任与质保范围、验收标准与交付物清单。\n文本：\n${text}`;
    const fallback = JSON.stringify(ai.mockRiskReview(), null, 2);
    const result = await ai.callModel('riskReview', prompt, fallback);
    let data;
    try {
      data = JSON.parse(result.replace(/```json|```/g, '').trim());
    } catch {
      data = ai.mockRiskReview();
    }
    res.json({ data, disclaimer: 'AI 识别仅供参考，请以财务到账/付款凭证为准' });
  });

  app.post('/api/ai/doc-gen', requireAuth, requireWrite('doc'), async (req, res) => {
    const b = req.body || {};
    const projectId = b.projectId;
    const p = project(projectId);
    if (!p) return sendError(res, 404, '请先选择项目');
    const prompt = `请根据项目数据生成“${b.templateKey || 'info'}”文档内容。项目：${JSON.stringify(p)}`;
    const fallback = JSON.stringify(ai.mockDocGen(b.templateKey || 'info', p), null, 2);
    const result = await ai.callModel('docGen', prompt, fallback);
    let data;
    try {
      data = JSON.parse(result.replace(/```json|```/g, '').trim());
    } catch {
      data = ai.mockDocGen(b.templateKey || 'info', p);
    }
    try {
      const docBuffer = await generateDocxBuffer(data.title || (p.name + '-文档'), data.generated || '');
      const fileName = `${p.name}-${(b.templateKey || 'info')}-${Date.now()}.docx`;
      const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.docx`;
      fs.writeFileSync(path.join(UPLOAD_DIR, storedName), docBuffer);
      const folder = db.prepare(`SELECT * FROM doc_folders WHERE project_id = ? AND name = '02-售中项目管理' LIMIT 1`).get(projectId)
        || db.prepare('SELECT * FROM doc_folders WHERE project_id = ? ORDER BY id LIMIT 1').get(projectId);
      const r = db.prepare(`INSERT INTO doc_files(project_id,folder_id,name,type,size,upload_time,note,ai_generated,archived,path)
        VALUES(?,?,?,?,?,?,?,?,?,?)`)
        .run(projectId, folder ? folder.id : 0, fileName, 'docx', docBuffer.length, now(), 'AI 文档模板生成', 1, 0, storedName);
      res.json({ data, disclaimer: 'AI 生成内容请人工复核后使用', file: { id: Number(r.lastInsertRowid), name: fileName, downloadUrl: `/api/doc-files/${Number(r.lastInsertRowid)}/download` } });
    } catch (e) {
      res.json({ data, disclaimer: 'AI 生成内容请人工复核后使用' });
    }
  });

  app.post('/api/ai/remind', requireAuth, async (req, res) => {
    const fallback = JSON.stringify(ai.mockReminders(), null, 2);
    const result = await ai.callModel('remind', '根据台账生成提醒事件', fallback);
    let data;
    try {
      data = JSON.parse(result.replace(/```json|```/g, '').trim());
    } catch {
      data = ai.mockReminders();
    }
    res.json({ data });
  });

  app.post('/api/ai/knowledge', requireAuth, async (req, res) => {
    const b = req.body || {};
    const fallback = JSON.stringify(ai.mockKnowledge(b.question || ''), null, 2);
    const result = await ai.callModel('knowledge', `知识库问答：${b.question || ''}`, fallback);
    let data;
    try {
      data = JSON.parse(result.replace(/```json|```/g, '').trim());
    } catch {
      data = ai.mockKnowledge(b.question || '');
    }
    res.json({ data });
  });

  // 新增：根据 AI 抽取结果创建项目
  app.post('/api/projects/from-ai', requireAuth, requireWrite('project'), (req, res) => {
    const b = req.body || {};
    if (!b.name) return sendError(res, 400, '项目名称不能为空');
    const id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
    db.prepare(`INSERT INTO projects(id,name,unit,amount,paid,risk,stage,type,sign_date,deadline,pm,remark,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, b.name, b.unit || '', Number(b.amount || 0), 0, b.risk || 'green', b.stage || '启动', b.type || '', b.sign_date || null, b.deadline || null, b.pm || '陈志远', b.remark || '', now(), now());
    seedDocFolders(id);
    res.json(deriveProject(project(id)));
  });
}

function computeReminders() {
  const t = today();
  const projects = db.prepare('SELECT * FROM projects').all();
  const items = [];
  const add = (row, type, level) => {
    const p = projects.find((x) => x.id === row.project_id);
    if (!p) return;
    items.push({
      id: `r-${type}-${row.id}`,
      project_id: row.project_id,
      project_name: p.name,
      type,
      title: row.name,
      amount: row.amount || 0,
      due_date: row.plan_date,
      level
    });
  };
  for (const row of db.prepare('SELECT * FROM fund_in WHERE recv_date IS NULL AND plan_date IS NOT NULL').all()) {
    if (row.plan_date < t) add(row, 'pay', 'overdue');
    else {
      const diff = Math.ceil((new Date(row.plan_date) - new Date(t)) / 86400000);
      if (diff <= 1) add(row, 'pay', 'd1');
      else if (diff <= 3) add(row, 'pay', 'd3');
      else if (diff <= 7) add(row, 'pay', 'd7');
    }
  }
  for (const row of db.prepare('SELECT * FROM fund_out WHERE recv_date IS NULL AND plan_date IS NOT NULL').all()) {
    if (row.plan_date < t) add(row, 'pay', 'overdue');
    else {
      const diff = Math.ceil((new Date(row.plan_date) - new Date(t)) / 86400000);
      if (diff <= 1) add(row, 'pay', 'd1');
      else if (diff <= 3) add(row, 'pay', 'd3');
      else if (diff <= 7) add(row, 'pay', 'd7');
    }
  }
  for (const p of projects.filter((x) => x.risk === 'red')) {
    items.push({
      id: `r-risk-${p.id}`,
      project_id: p.id,
      project_name: p.name,
      type: 'risk',
      title: p.remark || '高风险项目',
      amount: p.amount,
      due_date: p.deadline,
      level: 'overdue'
    });
  }
  return items;
}

async function generateDocxBuffer(title, body) {
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Microsoft YaHei', size: 21 } }
      }
    },
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: title || '智项目 · 多项目管理系统',
          heading: HeadingLevel.HEADING_1
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: '生成时间：' + now(),
              italics: true,
              color: '888888',
              size: 18
            })
          ]
        }),
        new Paragraph({ text: '' }),
        ...String(body || '').split(/\r?\n/).filter((s) => s.trim() !== '').map((s) => new Paragraph({ text: s })),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [new TextRun({ text: '（本文件由智项目 AI 模板生成，请人工复核后使用。）', color: '888888', size: 18 })]
        })
      ]
    }]
  });
  return Packer.toBuffer(doc);
}

module.exports = { registerRoutes };
