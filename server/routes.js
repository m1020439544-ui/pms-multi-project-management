const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
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

function buildMenuTree() {
  const flat = db.prepare('SELECT * FROM menu_config ORDER BY sort_order, id').all();
  const top = flat.filter((m) => !m.parent_id);
  const children = flat.filter((m) => m.parent_id);
  return top.map((m) => ({
    ...m,
    visible: !!m.visible,
    children: children.filter((c) => c.parent_id === m.id)
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
    res.json(buildMenuTree());
  });

  app.get('/api/menu/items', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT * FROM menu_config ORDER BY sort_order, id').all());
  });

  app.post('/api/menu/items', requireAuth, requireWrite('menu'), (req, res) => {
    const b = req.body || {};
    if (!b.key || !b.display) return sendError(res, 400, '缺少 key 或显示名');
    const keyExists = db.prepare('SELECT id FROM menu_config WHERE key = ?').get(b.key);
    if (keyExists) return sendError(res, 409, '菜单 key 已存在');
    const r = db.prepare(`INSERT INTO menu_config(parent_id,key,name,display,href,remark,sort_order,visible)
      VALUES(?,?,?,?,?,?,?,?)`)
      .run(b.parent_id || null, b.key, b.name || b.display, b.display, b.href || '', b.remark || '', Number(b.sort_order || 0), b.visible === false ? 0 : 1);
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
    db.prepare(`UPDATE menu_config SET parent_id=?, key=?, name=?, display=?, href=?, remark=?, sort_order=?, visible=?
      WHERE id=?`)
      .run(b.parent_id ?? cur.parent_id, key, b.name ?? cur.name, b.display ?? cur.display, b.href ?? cur.href,
        b.remark ?? cur.remark, Number(b.sort_order ?? cur.sort_order), b.visible === false ? 0 : 1, id);
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
        { key: 'overview', name: '总览', display: '总览', href: '#/overview', remark: '项目组合看板与统计', sort_order: 1, visible: true, parent_key: '' },
        { key: 'project', name: '项目', display: '项目', href: '#/projects', remark: '项目全生命周期管理', sort_order: 2, visible: true, parent_key: '' },
        { key: 'projects', name: '项目选择', display: '项目选择', href: '#/projects', remark: '项目列表与工作区入口', sort_order: 1, visible: true, parent_key: 'project' },
        { key: 'project-detail', name: '项目信息表', display: '项目信息表', href: '#/project-detail', remark: '基本信息与前后向资金', sort_order: 2, visible: true, parent_key: 'project' },
        { key: 'project-stages', name: '三阶段流程', display: '三阶段流程', href: '#/project-stages', remark: '启动 / 实施 / 收尾', sort_order: 3, visible: true, parent_key: 'project' },
        { key: 'docs', name: '文档', display: '文档', href: '#/documents', remark: '文档中心与标准化模板', sort_order: 3, visible: true, parent_key: '' },
        { key: 'remind', name: '提醒', display: '提醒', href: '#/reminders', remark: '回款 / 里程碑 / 风险提醒', sort_order: 4, visible: true, parent_key: '' },
        { key: 'ai', name: 'AI 配置', display: 'AI 配置', href: '#/ai-config', remark: '大模型接入与能力管理', sort_order: 5, visible: true, parent_key: '' },
        { key: 'settings', name: '设置', display: '设置', href: '#/settings', remark: '菜单自定义与系统配置', sort_order: 6, visible: true, parent_key: '' }
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
        parent_key: m.parent_key || ''
      });
    }
    const keys = new Set(normalized.map((m) => m.key));
    if (keys.size !== normalized.length) return sendError(res, 400, '菜单 key 存在重复');
    db.prepare('DELETE FROM menu_config').run();
    const insert = db.prepare(`INSERT INTO menu_config(parent_id,key,name,display,href,remark,sort_order,visible)
      VALUES(?,?,?,?,?,?,?,?)`);
    const keyToId = new Map();
    // 先插入顶级，再插入子级
    const top = normalized.filter((m) => !m.parent_key || !keys.has(m.parent_key));
    const children = normalized.filter((m) => m.parent_key && keys.has(m.parent_key));
    for (const m of top) {
      const r = insert.run(null, m.key, m.name, m.display, m.href, m.remark, m.sort_order, m.visible);
      keyToId.set(m.key, Number(r.lastInsertRowid));
    }
    for (const m of children) {
      const r = insert.run(keyToId.get(m.parent_key) || null, m.key, m.name, m.display, m.href, m.remark, m.sort_order, m.visible);
      keyToId.set(m.key, Number(r.lastInsertRowid));
    }
    res.json({ ok: true, count: normalized.length });
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
    db.prepare(`INSERT INTO projects(id,name,project_no,group_opportunity_code,approval_complete_date,start_date,expected_acceptance_date,sign_archive_date,our_unit,unit,customer_name,forward_contract_code,forward_contract_name,forward_contract_amount,forward_sign_date,backward_contract_code,backward_contract_name,backward_unit_name,backward_contract_amount,backward_sign_date,amount,paid,risk,stage,type,sign_date,deadline,pm,remark,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, b.name, b.project_no || '', b.group_opportunity_code || '', b.approval_complete_date || null, b.start_date || null,
        b.expected_acceptance_date || null, b.sign_archive_date || null, b.our_unit || '', b.unit || '',
        b.customer_name || b.unit || '', b.forward_contract_code || '', b.forward_contract_name || '',
        Number(b.forward_contract_amount || 0), b.forward_sign_date || null, b.backward_contract_code || '', b.backward_contract_name || '',
        b.backward_unit_name || '', Number(b.backward_contract_amount || 0), b.backward_sign_date || null,
        Number(b.amount || 0), Number(b.paid || 0), b.risk || 'green', b.stage || '启动',
        b.type || '', b.sign_date || null, b.deadline || null, b.pm || '陈志远', b.remark || '', now(), now());
    seedDocFolders(id);
    res.json(deriveProject(project(id)));
  });

  app.put('/api/projects/:id', requireAuth, requireWrite('project'), (req, res) => {
    const p = project(req.params.id);
    if (!p) return sendError(res, 404, '项目不存在');
    const b = req.body || {};
    db.prepare(`UPDATE projects SET name=?, project_no=?, group_opportunity_code=?, approval_complete_date=?, start_date=?, expected_acceptance_date=?, sign_archive_date=?, our_unit=?, unit=?, customer_name=?, forward_contract_code=?, forward_contract_name=?, forward_contract_amount=?, forward_sign_date=?, backward_contract_code=?, backward_contract_name=?, backward_unit_name=?, backward_contract_amount=?, backward_sign_date=?, amount=?, paid=?, risk=?, stage=?, type=?, sign_date=?, deadline=?, pm=?, remark=?, updated_at=?
      WHERE id=?`)
      .run(b.name ?? p.name, b.project_no ?? p.project_no, b.group_opportunity_code ?? p.group_opportunity_code,
        b.approval_complete_date ?? p.approval_complete_date, b.start_date ?? p.start_date,
        b.expected_acceptance_date ?? p.expected_acceptance_date, b.sign_archive_date ?? p.sign_archive_date,
        b.our_unit ?? p.our_unit, b.unit ?? p.unit, b.customer_name ?? p.customer_name,
        b.forward_contract_code ?? p.forward_contract_code, b.forward_contract_name ?? p.forward_contract_name,
        Number(b.forward_contract_amount ?? p.forward_contract_amount), b.forward_sign_date ?? p.forward_sign_date,
        b.backward_contract_code ?? p.backward_contract_code, b.backward_contract_name ?? p.backward_contract_name,
        b.backward_unit_name ?? p.backward_unit_name, Number(b.backward_contract_amount ?? p.backward_contract_amount),
        b.backward_sign_date ?? p.backward_sign_date, Number(b.amount ?? p.amount), Number(b.paid ?? p.paid),
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
