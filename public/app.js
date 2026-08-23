/* ============================================================
 * 智项目 · 多项目管理系统 — 前端 SPA
 * 技术说明：原生 JS + Hash 路由 + REST API，无第三方前端依赖
 * ============================================================ */
(function () {
  'use strict';

  const LS_TOKEN = 'pms_token';
  const LS_USER = 'pms_user';
  const LS_CURRENT = 'pms_current_project_v1';

  let me = JSON.parse(localStorage.getItem(LS_USER) || 'null');
  let menu = [];
  let currentProjectId = localStorage.getItem(LS_CURRENT) || null;
  let activeModal = null;

  const app = document.getElementById('app');
  const modalRoot = document.getElementById('modal-root');
  const toastEl = document.getElementById('toast');

  // ---------------- helpers ----------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[<>&"']/g, (c) => ({
      '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function num(n, digits) {
    const v = Number(n || 0);
    return v.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: digits === undefined ? 2 : digits });
  }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function toast(msg, isErr) {
    toastEl.textContent = msg;
    toastEl.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toastEl.className = 'toast'; }, 2600);
  }

  async function api(path, options) {
    const opts = options || {};
    const headers = Object.assign({}, opts.headers || {});
    if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const token = localStorage.getItem(LS_TOKEN);
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(path, Object.assign({}, opts, { headers }));
    let data = null;
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) {
      if (res.status === 401) {
        clearSession();
        renderLogin();
      }
      const err = new Error(data.error || '请求失败');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function clearSession() {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USER);
    me = null;
  }

  function isAdmin() { return me && me.role === 'admin'; }

  function canWrite(module) {
    if (!me) return false;
    if (me.role === 'admin') return true;
    let perms = {};
    try { perms = JSON.parse(me.permissions || '{}'); } catch (e) { perms = {}; }
    return !!(perms['*'] && perms['*'].write) || !!(perms[module] && perms[module].write);
  }

  function riskInfo(risk) {
    const map = {
      red: { txt: '高风险', cls: 'red' },
      yellow: { txt: '关注', cls: 'yellow' },
      green: { txt: '正常', cls: 'green' }
    };
    return map[risk] || map.green;
  }

  function stageInfo(stage) {
    return stage || '启动';
  }

  function statusInfo(status) {
    const map = {
      received: { txt: '已到账', cls: 'green' },
      partial: { txt: '部分到账', cls: 'yellow' },
      due: { txt: '临近应收', cls: 'yellow' },
      overdue: { txt: '已逾期', cls: 'red' },
      planned: { txt: '未到期', cls: 'gray' }
    };
    return map[status] || map.planned;
  }

  function levelInfo(level) {
    const map = {
      overdue: { txt: '已逾期', cls: 'red' },
      d1: { txt: '1天内', cls: 'red' },
      d3: { txt: '3天内', cls: 'yellow' },
      d7: { txt: '7天内', cls: 'yellow' }
    };
    return map[level] || { txt: '7天内', cls: 'yellow' };
  }

  function svg(name) {
    const paths = {
      plus: '<path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
      edit: '<path d="M3 13L2 16l3-1 8-8-2-2-8 8zM11 5l2 2" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
      trash: '<path d="M3 5h10M6 5V3h4v2M5 5l.5 8h5L11 5M7 8v2M9 8v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
      folder: '<path d="M2 5.5A1.5 1.5 0 013.5 4h3l1.5 2h5A1.5 1.5 0 0114.5 7.5v4A1.5 1.5 0 0113 13H3a1.5 1.5 0 01-1.5-1.5v-6z" stroke="currentColor" stroke-width="1.3"/>',
      doc: '<path d="M4 2h6l3 3v9H4V2z" stroke="currentColor" stroke-width="1.3"/><path d="M10 2v3h3" stroke="currentColor" stroke-width="1.3"/>',
      check: '<path d="M3 8l3 3 7-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
      warn: '<path d="M8 1.5L14.5 13.5H1.5L8 1.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 6v3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="11.5" r=".7" fill="currentColor"/>'
    };
    return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">${paths[name] || ''}</svg>`;
  }

  function brandSvg() {
    return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v9a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5v-9z" stroke="#fff" stroke-width="1.4"/><path d="M5 10.5V8M8 10.5V5.5M11 10.5V7" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg>`;
  }

  function iconBtn(action, icon, title, extraClass) {
    return `<button class="btn sm ${extraClass || ''}" data-action="${action}" title="${esc(title)}">${svg(icon)}</button>`;
  }

  function actionArg(el) {
    const a = el.dataset.action || '';
    const i = a.indexOf(':');
    return i > -1 ? a.slice(i + 1) : (el.dataset.id || '');
  }

  // ---------------- modal ----------------
  function openModal(title, bodyHtml, footerHtml, onMount) {
    closeModal();
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `
      <div class="modal">
        <div class="modal-head"><h3>${esc(title)}</h3><button class="close-x" data-action="modal-close">×</button></div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-foot">${footerHtml}</div>` : ''}
      </div>`;
    modalRoot.appendChild(mask);
    activeModal = mask;
    if (onMount) onMount(mask);
    return mask;
  }

  function closeModal() {
    if (activeModal) {
      activeModal.remove();
      activeModal = null;
    }
  }

  function modalButtons(buttons) {
    return buttons.map((b) => `<button class="btn ${b.cls || ''}" data-action="${b.action || ''}" ${b.id ? `id="${b.id}"` : ''}>${b.label}</button>`).join('');
  }

  function readForm(form) {
    const out = {};
    form.querySelectorAll('[name]').forEach((el) => {
      let val;
      if (el.type === 'checkbox') val = el.checked;
      else if (el.type === 'number') val = el.value === '' ? null : Number(el.value);
      else val = el.value;
      out[el.name] = val;
    });
    return out;
  }

  // ---------------- navigation ----------------
  function buildNav() {
    const top = menu.filter((m) => m.visible !== false);
    const items = top.map((m) => {
      const subs = (m.children || []).filter((c) => c.visible !== false);
      const activeKey = currentRouteKey();
      const isActive = m.key === activeKey || subs.some((c) => c.key === activeKey);
      if (subs.length) {
        const subHtml = subs.map((c) =>
          `<a class="nav-sub ${c.key === activeKey ? 'active' : ''}" href="${esc(c.href)}" title="${esc(c.remark || '')}">${esc(c.display || c.name)}</a>`
        ).join('');
        return `<div class="nav-dropdown">
          <a class="nav-item ${isActive ? 'active' : ''}" href="${esc(m.href)}" title="${esc(m.remark || '')}">${esc(m.display || m.name)}<span style="font-size:9px">▼</span></a>
          <div class="nav-panel">${subHtml}</div>
        </div>`;
      }
      return `<a class="nav-item ${m.key === activeKey ? 'active' : ''}" href="${esc(m.href)}" title="${esc(m.remark || '')}">${esc(m.display || m.name)}</a>`;
    }).join('');
    return `
      <div class="topnav">
        <div class="brand"><div class="brand-logo">${brandSvg()}</div>智项目 · 多项目管理系统</div>
        <div class="nav-menu">${items}</div>
        <div class="nav-user"><span class="uname">${esc(me ? me.name : '')} · ${me && me.role === 'admin' ? 'PMO' : '只读'}</span>
          <div class="avatar">${esc((me && me.name || '?').slice(0, 1))}</div>
          <button class="btn sm ghost" data-action="logout">退出</button>
        </div>
      </div>`;
  }

  function currentRouteKey() {
    const h = (location.hash || '#/overview').replace('#/', '');
    const map = {
      overview: 'overview',
      projects: 'projects',
      'project-detail': 'project-detail',
      'project-stages': 'project-stages',
      contracts: 'contracts',
      documents: 'docs',
      templates: 'templates',
      pmo: 'pmo',
      kb: 'kb',
      reminders: 'remind',
      'ai-config': 'ai',
      settings: 'settings'
    };
    return map[h] || 'overview';
  }

  function appShell(innerHtml) {
    app.innerHTML = `
      <div class="app">
        ${buildNav()}
        <div class="container">${innerHtml}</div>
      </div>`;
  }

  function setCurrent(id) {
    currentProjectId = id || null;
    if (id) localStorage.setItem(LS_CURRENT, id);
    else localStorage.removeItem(LS_CURRENT);
  }

  async function getCurrentProject() {
    if (!currentProjectId) return null;
    try { return await api('/api/projects/' + currentProjectId); } catch (e) { return null; }
  }

  function currentBanner(project) {
    if (!project) {
      return `<div class="banner">
        <span style="color:#D9A00B">${svg('warn')}</span>
        <span style="color:#8A6A06;font-weight:500;">尚未选择项目，当前展示示例数据。</span>
        <a href="#/projects" style="color:var(--primary);font-weight:600;">前往项目选择 →</a>
      </div>`;
    }
    const pct = project.amount > 0 ? Math.round(project.paid / project.amount * 100) : 0;
    const risk = riskInfo(project.risk);
    return `<div class="card" style="padding:12px 18px;margin-bottom:16px;display:flex;align-items:center;gap:14px;">
      <div style="width:36px;height:36px;border-radius:8px;background:var(--primary-subtle);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex:none;">${esc(project.name.slice(0,1))}</div>
      <div class="flex1">
        <div style="font-weight:600;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">${esc(project.name)}
          <span class="tag primary">${esc(stageInfo(project.stage))}</span>
          <span class="tag ${risk.cls}">● ${risk.txt}</span>
        </div>
        <div class="small muted mt8">${esc(project.unit || '')} · 合同额 <b class="amount num">${num(project.amount)}</b> 万 · 回款率 <b>${num(pct)}%</b> · ${esc(project.type || '')}</div>
      </div>
      <a class="btn sm" href="#/projects">切换项目</a>
    </div>`;
  }

  function viewTitle(title, desc, actionsHtml) {
    return `<div class="page-title">
      <div><h2>${esc(title)}</h2>${desc ? `<div class="desc">${esc(desc)}</div>` : ''}</div>
      ${actionsHtml ? `<div class="actions">${actionsHtml}</div>` : ''}
    </div>`;
  }

  // ---------------- router ----------------
  const routes = {
    overview: renderOverview,
    projects: renderProjects,
    'project-detail': renderProjectDetail,
    'project-stages': renderProjectStages,
    contracts: renderContracts,
    documents: renderDocuments,
    templates: renderTemplates,
    pmo: renderPmo,
    kb: renderKnowledge,
    reminders: renderReminders,
    'ai-config': renderAiConfig,
    settings: renderSettings
  };

  async function route() {
    if (!me) {
      renderLogin();
      return;
    }
    let h = (location.hash || '#/overview').replace('#/', '');
    if (!routes[h]) h = 'overview';
    const renderer = routes[h];
    app.innerHTML = '<div class="container"><div class="empty">加载中…</div></div>';
    try {
      await renderer();
    } catch (e) {
      if (e && e.status !== 401) {
        app.innerHTML = `<div class="container"><div class="empty">加载失败：${esc(e.message)}</div></div>`;
      }
    }
  }

  // ---------------- login ----------------
  function renderLogin() {
    app.innerHTML = `
      <div class="login-wrap">
        <form class="login-card" data-submit="login">
          <div class="brand-logo">${brandSvg()}</div>
          <h1>智项目 · 多项目管理系统</h1>
          <div class="sub">运营商行业多项目全生命周期管理平台</div>
          <div class="field"><label>用户名</label><input class="input" name="username" value="pmo" autocomplete="username"></div>
          <div class="field"><label>密码</label><input class="input" type="password" name="password" value="pmo2026" autocomplete="current-password"></div>
          <button class="btn primary" style="width:100%;height:40px" type="submit">登录</button>
          <div class="small muted mt16">演示账号：pmo / pmo2026（管理员）　viewer / pmo2026（只读）</div>
        </form>
      </div>`;
  }

  async function handleLogin(form) {
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(readForm(form))
      });
      localStorage.setItem(LS_TOKEN, data.token);
      localStorage.setItem(LS_USER, JSON.stringify(data.user));
      me = data.user;
      toast('登录成功，欢迎回来');
      await loadMenu();
      location.hash = '#/overview';
      await route();
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function loadMenu() {
    try { menu = await api('/api/menu'); } catch (e) { menu = []; }
  }

  // ---------------- overview ----------------
  async function renderOverview() {
    const projects = await api('/api/projects');
    const reminders = await api('/api/reminders');
    const stats = calcStats(projects);
    const riskCount = projects.filter((p) => p.risk === 'red').length;
    const inManage = projects.filter((p) => p.stage !== '收尾').length;
    appShell(`
      ${viewTitle('总览看板', '项目组合统计、甘特图与风险待办')}
      <div class="grid stat-grid mb16">
        ${statCard('在管项目', num(inManage), '个', '共 ' + projects.length + ' 个项目')}
        ${statCard('合同总额', num(stats.totalAmount), '万元', '已回款 ' + num(stats.totalPaid) + ' 万')}
        ${statCard('平均回款率', num(stats.avgRatio) + '%', '', '按合同金额加权')}
        ${statCard('风险项目', num(riskCount), '个', '需重点跟踪')}
      </div>
      <div class="split">
        <div>
          <div class="card card-pad mb16">
            <div class="space-between mb16">
              <h3 style="margin:0;font-size:15px">组合甘特图</h3>
              <div class="row">
                <select id="g-stage" class="input" style="width:auto;height:32px"><option value="">全部阶段</option>${['启动','实施','收尾'].map(s=>`<option>${s}</option>`).join('')}</select>
                <select id="g-risk" class="input" style="width:auto;height:32px"><option value="">全部风险</option>${['red','yellow','green'].map(r=>`<option value="${r}">${riskInfo(r).txt}</option>`).join('')}</select>
              </div>
            </div>
            <div class="gantt" id="gantt"></div>
          </div>
          <div class="card table-wrap">
            <table class="table">
              <thead><tr><th>项目名称</th><th>单位</th><th class="num">合同额(万)</th><th class="num">回款率</th><th>阶段</th><th>风险</th><th>截止日期</th></tr></thead>
              <tbody>
                ${projects.map((p) => {
                  const r = riskInfo(p.risk);
                  return `<tr>
                    <td><a href="#/project-detail" data-action="select-project" data-id="${esc(p.id)}">${esc(p.name)}</a></td>
                    <td class="muted">${esc(p.unit || '')}</td>
                    <td class="num amount">${num(p.amount)}</td>
                    <td class="num">${num(p.paymentRatio)}%</td>
                    <td><span class="tag primary">${esc(stageInfo(p.stage))}</span></td>
                    <td><span class="tag ${r.cls}">${r.txt}</span></td>
                    <td class="muted">${esc(p.deadline || '')}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="card card-pad">
          <h3 style="margin:0 0 12px;font-size:15px">待办面板</h3>
          ${reminders.length ? reminders.slice(0, 12).map((r) => {
            const lv = levelInfo(r.level);
            return `<div style="padding:10px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:8px;">
              <div style="min-width:0;"><div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.title)}</div>
              <div class="small muted">${esc(r.project_name || '')} · ${esc(r.due_date || '')}</div></div>
              <span class="tag ${lv.cls}">${lv.txt}</span>
            </div>`;
          }).join('') : '<div class="empty">暂无待办</div>'}
        </div>
      </div>`);
    drawGantt(projects);
    bindGanttFilters(projects);
  }

  function calcStats(projects) {
    const totalAmount = projects.reduce((s, p) => s + (p.amount || 0), 0);
    const totalPaid = projects.reduce((s, p) => s + (p.paid || 0), 0);
    return { totalAmount, totalPaid, avgRatio: totalAmount > 0 ? Math.round(totalPaid / totalAmount * 1000) / 10 : 0 };
  }

  function statCard(label, value, unit, foot) {
    return `<div class="card card-pad stat-card">
      <div class="label">${esc(label)}</div>
      <div class="value num">${esc(value)}<span class="small" style="font-weight:500;color:var(--text-secondary)"> ${esc(unit || '')}</span></div>
      <div class="foot">${esc(foot)}</div>
    </div>`;
  }

  function drawGantt(projects) {
    const el = document.getElementById('gantt');
    if (!el) return;
    const visible = projects.filter((p) => !p.deadline);
    const withDate = projects.filter((p) => p.deadline);
    const allDates = withDate.map((p) => [p.sign_date, p.deadline]).flat().filter(Boolean).sort();
    if (!allDates.length) { el.innerHTML = '<div class="empty">暂无可展示的甘特数据</div>'; return; }
    const min = allDates[0], max = allDates[allDates.length - 1];
    const span = Math.max(1, (new Date(max) - new Date(min)) / 86400000);
    const t = today();
    const tPct = Math.max(0, Math.min(100, (new Date(t) - new Date(min)) / (new Date(max) - new Date(min)) * 100));
    el.innerHTML = `
      ${withDate.map((p) => {
        const start = new Date(p.sign_date || min);
        const end = new Date(p.deadline);
        const left = Math.max(0, (start - new Date(min)) / 86400000 / span * 100);
        const width = Math.max(3, (end - start) / 86400000 / span * 100);
        const color = p.risk === 'red' ? 'var(--risk-red)' : p.risk === 'yellow' ? 'var(--risk-yellow)' : 'var(--risk-green)';
        return `<div class="gantt-row">
          <div class="g-label" title="${esc(p.name)}">${esc(p.name)}</div>
          <div class="gantt-track"><div class="gantt-bar" style="left:${left}%;width:${width}%;background:${color};"></div></div>
        </div>`;
      }).join('')}
      <div class="gantt-row" style="position:relative">
        <div class="g-label">今日</div>
        <div class="gantt-track"><div class="gantt-today" style="left:${tPct}%"></div></div>
      </div>`;
  }

  function bindGanttFilters(allProjects) {
    const stageSel = document.getElementById('g-stage');
    const riskSel = document.getElementById('g-risk');
    if (!stageSel || !riskSel) return;
    const apply = () => {
      const stage = stageSel.value, risk = riskSel.value;
      const filtered = allProjects.filter((p) => (!stage || p.stage === stage) && (!risk || p.risk === risk));
      drawGantt(filtered);
    };
    stageSel.addEventListener('change', apply);
    riskSel.addEventListener('change', apply);
  }

  // ---------------- projects ----------------
  async function renderProjects() {
    const projects = await api('/api/projects');
    const viewState = await api('/api/settings/project-view').catch(() => ({ view: 'card' }));
    window._projectView = viewState.view === 'table' ? 'table' : 'card';
    appShell(`
      ${viewTitle('项目选择', '项目全生命周期管理，点击“选为当前项目”进入工作区', `
        <button class="btn" data-action="toggle-project-view" title="切换显示方式">${window._projectView === 'table' ? svg('check') + ' 卡片视图' : svg('doc') + ' 表格视图'}</button>
        ${canWrite('project') ? `<button class="btn" data-action="project-import">${svg('plus')} 批量导入项目</button>` : ''}
        ${canWrite('project') ? `<button class="btn primary" data-action="new-project">${svg('plus')} 新建项目</button>` : ''}`)}
      ${window._projectView === 'table' ? projectTableHtml(projects) : `<div class="project-grid">
        ${projects.map((p) => {
          const r = riskInfo(p.risk);
          return `<div class="card project-card">
            <div class="top">
              <div class="name">${esc(p.name)}</div>
              <span class="tag ${r.cls}">${r.txt}</span>
            </div>
            <div class="meta">${esc(p.customer_name || p.unit || '')} · ${esc(p.type || '')}</div>
            <div class="meta"><span class="tag primary">${esc(stageInfo(p.stage))}</span><span class="muted">PM：${esc(p.pm || '')}</span></div>
            <div class="stats">
              <div>合同额<b class="amount">${num(p.amount)}</b>万</div>
              <div>回款率<b>${num(p.paymentRatio)}%</b></div>
            </div>
            <div class="muted small">${esc(p.remark || '')}</div>
            <div class="row mt8">
              <button class="btn primary sm" data-action="select-project" data-id="${esc(p.id)}">选为当前项目</button>
              ${canWrite('project') ? `${iconBtn('edit-project:' + esc(p.id), 'edit', '编辑')}${iconBtn('delete-project:' + esc(p.id), 'trash', '删除', 'danger')}` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>`}`);
  }

  function projectTableHtml(projects) {
    return `<div class="card table-wrap"><table class="table">
      <thead><tr><th>项目编号</th><th>项目名称</th><th>客户名称</th><th class="num">合同额(万)</th><th class="num">回款率</th><th>阶段</th><th>风险</th><th>截止日期</th><th>操作</th></tr></thead>
      <tbody>${projects.map((p) => {
        const r = riskInfo(p.risk);
        return `<tr>
          <td class="muted">${esc(p.project_no || p.id)}</td>
          <td><b>${esc(p.name)}</b></td>
          <td>${esc(p.customer_name || p.unit || '')}</td>
          <td class="num amount">${num(p.amount)}</td>
          <td class="num">${num(p.paymentRatio)}%</td>
          <td><span class="tag primary">${esc(stageInfo(p.stage))}</span></td>
          <td><span class="tag ${r.cls}">${r.txt}</span></td>
          <td class="muted">${esc(p.deadline || '')}</td>
          <td class="actions">
            <button class="btn sm primary" data-action="select-project" data-id="${esc(p.id)}">选为当前项目</button>
            ${canWrite('project') ? `${iconBtn('edit-project:' + esc(p.id), 'edit', '编辑')}${iconBtn('delete-project:' + esc(p.id), 'trash', '删除', 'danger')}` : ''}
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  }

  async function toggleProjectView() {
    const next = window._projectView === 'table' ? 'card' : 'table';
    try {
      await api('/api/settings/project-view', { method: 'PUT', body: JSON.stringify({ view: next }) });
      toast('项目显示方式已切换');
      await renderProjects();
    } catch (e) { toast(e.message, true); }
  }

  async function handleNewProject() {
    openModal('新建项目', projectFormHtml(null),
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'save-project-btn' }]));
  }

  function handleProjectImport() {
    openModal('批量导入项目', `
      <p class="small muted mb16">请先下载 Excel 模板并按列填写，支持一次导入多个项目；项目编号重复的行将自动跳过。</p>
      <div class="row mb16">
        <button class="btn sm" data-action="download" data-url="/api/project-import-template" data-name="pms-project-import-template.xlsx">${svg('doc')} 下载导入模板</button>
      </div>
      <input class="input" type="file" id="project-import-file" accept=".xlsx">
      <div id="import-result" class="mt16"></div>`,
      modalButtons([{ label: '关闭', action: 'modal-close' }]));
  }

  async function doProjectImport(file) {
    const fd = new FormData();
    fd.append('file', file);
    const box = document.getElementById('import-result');
    if (box) box.innerHTML = '<div class="muted">导入中…</div>';
    try {
      const res = await fetch('/api/projects/import', { method: 'POST', headers: { 'Authorization': 'Bearer ' + localStorage.getItem(LS_TOKEN) }, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '导入失败');
      box.innerHTML = `
        <div class="row"><span class="tag green">成功 ${data.success} 条</span><span class="tag red">失败 ${data.failed.length} 条</span></div>
        ${data.failed.length ? `<div class="mt8">${data.failed.map(f=>`<div class="small" style="color:var(--risk-red)">第 ${f.row} 行：${esc(f.reason)}</div>`).join('')}</div>` : ''}`;
      toast('导入完成');
      await renderProjects();
    } catch (e) {
      if (box) box.innerHTML = `<div class="small" style="color:var(--risk-red)">${esc(e.message)}</div>`;
      toast(e.message, true);
    }
  }

  async function saveProject(form) {
    try {
      const data = readForm(form);
      await api('/api/projects', { method: 'POST', body: JSON.stringify(data) });
      toast('项目已创建');
      closeModal();
      await renderProjects();
    } catch (e) { toast(e.message, true); }
  }

  async function handleEditProject(id) {
    let p;
    try { p = await api('/api/projects/' + id); } catch (e) { return toast(e.message, true); }
    openModal('编辑项目', projectFormHtml(p, id),
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'update-project-btn' }]));
  }

  function projectFormHtml(p, id) {
    const v = p || {};
    const val = (key, fallback = '') => esc(v[key] === undefined || v[key] === null ? fallback : v[key]);
    return `
      <form data-submit="${id ? 'update-project' : 'save-project'}" ${id ? `data-id="${esc(id)}"` : ''}>
        <div class="form-grid">
          <div class="field"><label>项目名称 *</label><input class="input" name="name" value="${val('name')}"></div>
          <div class="field"><label>项目编号</label><input class="input" name="project_no" value="${val('project_no')}"></div>
          <div class="field"><label>集团商机编码</label><input class="input" name="group_opportunity_code" value="${val('group_opportunity_code')}"></div>
          <div class="field"><label>立项完成时间</label><input class="input" type="date" name="approval_complete_date" value="${val('approval_complete_date')}"></div>
          <div class="field"><label>项目金额(万) *</label><input class="input" type="number" step="0.01" name="amount" value="${val('amount', 0)}"></div>
          <div class="field"><label>已支付(万)</label><input class="input" type="number" step="0.01" name="paid" value="${val('paid', 0)}"></div>
          <div class="field"><label>开工时间</label><input class="input" type="date" name="start_date" value="${val('start_date')}"></div>
          <div class="field"><label>预计终验时间</label><input class="input" type="date" name="expected_acceptance_date" value="${val('expected_acceptance_date')}"></div>
          <div class="field"><label>签约归档时间</label><input class="input" type="date" name="sign_archive_date" value="${val('sign_archive_date')}"></div>
          <div class="field"><label>我方单位</label><input class="input" name="our_unit" value="${val('our_unit')}"></div>
          <div class="field"><label>客户名称</label><input class="input" name="customer_name" value="${val('customer_name', v.unit || '')}"></div>
          <div class="field"><label>项目类型</label><input class="input" name="type" value="${val('type')}"></div>
          <div class="field"><label>签约日期</label><input class="input" type="date" name="sign_date" value="${val('sign_date')}"></div>
          <div class="field"><label>截止日期</label><input class="input" type="date" name="deadline" value="${val('deadline')}"></div>
          <div class="field"><label>阶段</label><select class="input" name="stage">${['启动','实施','收尾'].map(s=>`<option ${s===v.stage?'selected':''}>${s}</option>`).join('')}</select></div>
          <div class="field"><label>风险</label><select class="input" name="risk">${['green','yellow','red'].map(r=>`<option value="${r}" ${r===v.risk?'selected':''}>${riskInfo(r).txt}</option>`).join('')}</select></div>
          <div class="field"><label>收入类型</label><select class="input" name="income_type"><option value="">未设置</option><option value="周期" ${v.income_type==='周期'?'selected':''}>周期</option><option value="非周期" ${v.income_type==='非周期'?'selected':''}>非周期</option></select></div>
          <div class="field"><label>净额/全额</label><select class="input" name="net_or_full"><option value="">未设置</option><option value="净额" ${v.net_or_full==='净额'?'selected':''}>净额</option><option value="全额" ${v.net_or_full==='全额'?'selected':''}>全额</option></select></div>
          <div class="field"><label>当前里程碑</label><input class="input" name="milestone" value="${val('milestone')}"></div>
          <div class="field"><label>下一里程碑</label><input class="input" name="next_milestone" value="${val('next_milestone')}"></div>
          <div class="field"><label>下一里程碑预计时间</label><input class="input" type="date" name="next_milestone_date" value="${val('next_milestone_date')}"></div>
          <div class="field"><label>延期函</label><input class="input" name="delay_extension" value="${val('delay_extension')}"></div>
          <div class="field"><label>项目经理</label><input class="input" name="pm" value="${val('pm', '陈志远')}"></div>
          <div class="field full"><label>备注</label><textarea class="input" name="remark">${val('remark')}</textarea></div>
          <div class="field full"><label>项目进度详述</label><textarea class="input" name="progress">${val('progress')}</textarea></div>
          <div class="field full"><h3 style="margin:8px 0 4px;font-size:14px">前向合同信息</h3></div>
          <div class="field"><label>前向合同编码</label><input class="input" name="forward_contract_code" value="${val('forward_contract_code')}"></div>
          <div class="field"><label>前向合同名称</label><input class="input" name="forward_contract_name" value="${val('forward_contract_name')}"></div>
          <div class="field"><label>前向签约金额(万)</label><input class="input" type="number" step="0.01" name="forward_contract_amount" value="${val('forward_contract_amount', 0)}"></div>
          <div class="field"><label>前向签约时间</label><input class="input" type="date" name="forward_sign_date" value="${val('forward_sign_date')}"></div>
          <div class="field full"><h3 style="margin:8px 0 4px;font-size:14px">后向合同信息</h3></div>
          <div class="field"><label>后向合同编码</label><input class="input" name="backward_contract_code" value="${val('backward_contract_code')}"></div>
          <div class="field"><label>后向合同名称</label><input class="input" name="backward_contract_name" value="${val('backward_contract_name')}"></div>
          <div class="field"><label>后向单位名称</label><input class="input" name="backward_unit_name" value="${val('backward_unit_name')}"></div>
          <div class="field"><label>后向签约金额(万)</label><input class="input" type="number" step="0.01" name="backward_contract_amount" value="${val('backward_contract_amount', 0)}"></div>
          <div class="field"><label>后向签约时间</label><input class="input" type="date" name="backward_sign_date" value="${val('backward_sign_date')}"></div>
        </div>
      </form>`;
  }

  async function updateProject(form, id) {
    try {
      await api('/api/projects/' + id, { method: 'PUT', body: JSON.stringify(readForm(form)) });
      toast('项目已更新');
      closeModal();
      await renderProjects();
    } catch (e) { toast(e.message, true); }
  }

  async function handleDeleteProject(id) {
    let p;
    try { p = await api('/api/projects/' + id); } catch (e) { return toast(e.message, true); }
    openModal('删除确认', `<p>确认删除项目“<b>${esc(p.name)}</b>”吗？该操作将同时删除其台账、文档、提醒等全部数据，且不可恢复。</p>`,
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '确认删除', cls: 'danger', action: 'confirm-delete-project', id: 'del-project-btn' }]),
      () => { window._delProjectId = id; });
  }

  async function confirmDeleteProject() {
    const id = window._delProjectId;
    try {
      await api('/api/projects/' + id, { method: 'DELETE' });
      if (currentProjectId === id) setCurrent(null);
      toast('项目已删除');
      closeModal();
      await renderProjects();
    } catch (e) { toast(e.message, true); }
  }

  async function handleSelectProject(id) {
    setCurrent(id);
    toast('已切换当前项目');
    location.hash = '#/project-detail';
    await route();
  }

  // ---------------- project detail ----------------
  async function renderProjectDetail() {
    const project = await getCurrentProject();
    const tab = window._detailTab || 'info';
    appShell(`
      ${viewTitle('项目工作区', '当前项目横幅 + 5 个信息 Tab')}
      ${currentBanner(project)}
      <div class="tabs">
        ${['info','funds','docs','risks','changes'].map((t) => `<button class="tab ${tab===t?'active':''}" data-action="detail-tab" data-tab="${t}">${{info:'项目信息',funds:'资金明细',docs:'过程文档',risks:'风险记录',changes:'变更记录'}[t]}</button>`).join('')}
      </div>
      <div id="detail-body"></div>`);
    await renderDetailTab(tab, project);
  }

  async function renderDetailTab(tab, project) {
    const body = document.getElementById('detail-body');
    if (!body) return;
    if (!project) {
      body.innerHTML = '<div class="empty">请先前往项目选择页选择当前项目</div>';
      return;
    }
    if (tab === 'info') {
      body.innerHTML = detailInfoHtml(project);
      return;
    }
    if (tab === 'funds') {
      const data = await api('/api/projects/' + project.id + '/finance');
      body.innerHTML = fundsHtml(project, data);
      return;
    }
    if (tab === 'docs') {
      const folders = await api('/api/projects/' + project.id + '/folders');
      body.innerHTML = docsHtml(project, folders);
      bindFolderTree(project.id);
      return;
    }
    if (tab === 'risks') {
      const reminders = await api('/api/reminders');
      const riskItems = reminders.filter((r) => r.project_id === project.id || r.type === 'risk');
      let checks = [];
      try { checks = (await api('/api/pmo/checks')).filter((c) => c.project_id === project.id && c.result !== '通过'); } catch (e) {}
      body.innerHTML = risksHtml(project, riskItems, checks);
      return;
    }
    if (tab === 'changes') {
      let changes = [];
      try { changes = (await api('/api/pmo/changes')).filter((c) => c.project_id === project.id); } catch (e) {}
      body.innerHTML = changesHtml(project, changes);
      return;
    }
  }

  function detailInfoHtml(p) {
    const row = (label, value) => `<div class="row" style="justify-content:space-between;padding:7px 0;border-bottom:1px solid #F0F1F4">
      <span class="muted" style="flex:none">${esc(label)}</span><span style="text-align:right;font-weight:500">${value === undefined || value === '' || value === null ? '—' : esc(value)}</span></div>`;
    const card = (title, body) => `<div class="card card-pad"><h3 style="margin:0 0 8px;font-size:15px">${esc(title)}</h3>${body}</div>`;
    return `<div class="grid" style="grid-template-columns:1fr 1fr">
      <div style="display:flex;flex-direction:column;gap:16px">
        ${card('基本信息', `
          ${row('项目名称', p.name)}
          ${row('项目编号', p.project_no || p.id)}
          ${row('集团商机编码', p.group_opportunity_code)}
          ${row('项目金额(万)', num(p.amount))}
          ${row('我方单位', p.our_unit)}
          ${row('客户名称', p.customer_name || p.unit)}
          ${row('项目经理', p.pm)}
          ${row('项目类型', p.type)}
          ${row('备注', p.remark)}
        `)}
        ${card('里程碑与归档', `
          ${row('立项完成时间', p.approval_complete_date)}
          ${row('开工时间', p.start_date)}
          ${row('预计终验时间', p.expected_acceptance_date)}
          ${row('签约归档时间', p.sign_archive_date)}
          ${row('签约日期', p.sign_date)}
          ${row('截止日期', p.deadline)}
        `)}
        ${card('售中管控', `
          ${row('收入类型（周期/非周期）', p.income_type)}
          ${row('项目净额/全额', p.net_or_full)}
          ${row('当前里程碑', p.milestone)}
          ${row('下一里程碑', p.next_milestone)}
          ${row('下一里程碑预计时间', p.next_milestone_date)}
          ${row('是否拿到延期函', p.delay_extension)}
          ${row('项目进度详述', p.progress)}
        `)}
      </div>
      <div style="display:flex;flex-direction:column;gap:16px">
        ${card('前向合同信息', `
          ${row('前向合同编码', p.forward_contract_code)}
          ${row('前向合同名称', p.forward_contract_name)}
          ${row('前向签约金额(万)', p.forward_contract_amount ? num(p.forward_contract_amount) : '')}
          ${row('前向签约时间', p.forward_sign_date)}
        `)}
        ${card('后向合同信息', `
          ${row('后向合同编码', p.backward_contract_code)}
          ${row('后向合同名称', p.backward_contract_name)}
          ${row('后向单位名称', p.backward_unit_name)}
          ${row('后向签约金额(万)', p.backward_contract_amount ? num(p.backward_contract_amount) : '')}
          ${row('后向签约时间', p.backward_sign_date)}
        `)}
        ${card('金额概览', `<div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
          ${statCard('合同金额', num(p.amount), '万', '含税')}
          ${statCard('已支付', num(p.paid), '万', '回款率 ' + num(p.paymentRatio) + '%')}
          ${statCard('未支付', num(p.unpaid), '万', '待跟踪')}
          ${statCard('风险等级', riskInfo(p.risk).txt, '', '')}
        </div>`)}
        ${canWrite('project') ? `<div class="row"><button class="btn" data-action="edit-project-detail" data-id="${esc(p.id)}">编辑信息</button></div>` : ''}
      </div>
    </div>`;
  }

  async function handleEditProjectDetail(id) {
    await handleEditProject(id);
  }

  function fundsHtml(project, data) {
    const t = data.totals;
    const statusOptions = { received:'已到账', partial:'部分到账', due:'临近应收', overdue:'已逾期', planned:'未到期' };
    return `
      <div class="grid mb16" style="grid-template-columns:repeat(4,1fr)">
        ${statCard('前向应收合计', num(t.inTotal), '万', '已到账 ' + num(t.inReceived) + ' 万')}
        ${statCard('后向应付合计', num(t.outTotal), '万', '已支付 ' + num(t.outPaid) + ' 万')}
        ${statCard('后向已签约', num(t.signed), '万', '剩余未签约 ' + num(t.remainingSignable) + ' 万')}
        ${statCard('已签约未支付', num(t.signedUnpaid), '万', '待支付')}
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        ${fundTable('前向回款（客户 → 我司）', 'fund-in', project.id, data.fundIn)}
        ${fundTable('后向支付（我司 → 供应商）', 'fund-out', project.id, data.fundOut)}
      </div>
      <div class="card card-pad mt16">
        <div class="space-between mb16"><h3 style="margin:0;font-size:15px">后向合同</h3>
          ${canWrite('fund') ? `<button class="btn sm primary" data-action="new-contract" data-id="${esc(project.id)}">${svg('plus')} 新增合同</button>` : ''}</div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>合同名称</th><th>供应商</th><th class="num">可签约</th><th class="num">已签约</th><th class="num">已支付</th><th class="num">剩余未签约</th><th class="num">已签约未支付</th>${canWrite('fund')?'<th></th>':''}</tr></thead>
          <tbody>${data.contracts.map((c) => `
            <tr><td>${esc(c.name)}</td><td>${esc(c.supplier || '')}</td>
            <td class="num">${num(c.signable)}</td><td class="num">${num(c.signed)}</td><td class="num">${num(c.paid)}</td>
            <td class="num amount">${num(c.signable - c.signed)}</td><td class="num">${num(c.signed - c.paid)}</td>
            ${canWrite('fund') ? `<td class="actions">${iconBtn('edit-contract:' + c.id, 'edit', '编辑')}${iconBtn('delete-contract:' + c.id, 'trash', '删除', 'danger')}</td>` : ''}
            </tr>`).join('')}</tbody>
        </table></div>
      </div>`;
  }

  function fundTable(title, type, projectId, rows) {
    return `<div class="card card-pad">
      <div class="space-between mb16"><h3 style="margin:0;font-size:15px">${esc(title)}</h3>
        ${canWrite('fund') ? `<button class="btn sm primary" data-action="new-fund" data-type="${type}" data-id="${esc(projectId)}">${svg('plus')} 新增条款</button>` : ''}</div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>款项名称</th><th>触发条件</th><th class="num">应收/应付</th><th>应收/付日期</th><th>实收/付日期</th><th>发票号</th><th>状态</th>${canWrite('fund')?'<th></th>':''}</tr></thead>
        <tbody>${rows.map((r) => {
          const st = statusInfo(r.status);
          return `<tr><td>${esc(r.name)}</td><td class="muted">${esc(r.cond || '')}</td>
          <td class="num amount">${num(r.amount)}</td><td>${esc(r.plan_date || '')}</td><td>${esc(r.recv_date || '')}</td><td>${esc(r.invoice || '')}</td>
          <td><span class="tag ${st.cls}">${st.txt}</span></td>
          ${canWrite('fund') ? `<td class="actions"><button class="btn sm" data-action="edit-fund:${type}:${r.id}" data-pid="${esc(projectId)}" title="编辑">${svg('edit')}</button><button class="btn sm danger" data-action="delete-fund:${type}:${r.id}" data-pid="${esc(projectId)}" title="删除">${svg('trash')}</button></td>` : ''}
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>`;
  }

  async function handleNewFund(type, projectId) {
    const isIn = type === 'fund-in';
    openModal(isIn ? '新增前向回款条款' : '新增后向支付条款', `
      <form data-submit="save-fund" data-type="${type}" data-id="${esc(projectId)}">
        <div class="form-grid">
          <div class="field full"><label>款项名称 *</label><input class="input" name="name"></div>
          <div class="field full"><label>触发条件（自定义文本）</label><input class="input" name="cond"></div>
          <div class="field"><label>比例(%)</label><input class="input" type="number" step="0.01" name="ratio" value="0"></div>
          <div class="field"><label>应收/应付金额(万)</label><input class="input" type="number" step="0.01" name="amount" value="0"></div>
          <div class="field"><label>应收/应付日期</label><input class="input" type="date" name="plan_date"></div>
          <div class="field"><label>实收/实付日期</label><input class="input" type="date" name="recv_date"></div>
          <div class="field"><label>发票号</label><input class="input" name="invoice"></div>
          <div class="field"><label>状态</label><select class="input" name="status"><option value="planned">未到期</option><option value="due">临近应收</option><option value="received">已到账</option><option value="partial">部分到账</option></select></div>
        </div>
      </form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'save-fund-btn' }]));
  }

  async function saveFund(form, type, projectId) {
    try {
      await api('/api/projects/' + projectId + '/' + type, { method: 'POST', body: JSON.stringify(readForm(form)) });
      toast('条款已保存');
      closeModal();
      await renderProjectDetail();
    } catch (e) { toast(e.message, true); }
  }

  async function handleEditFund(key, pid) {
    const [type, id] = key.split(':');
    const all = type === 'fund-in'
      ? await api('/api/projects/' + pid + '/fund-in')
      : await api('/api/projects/' + pid + '/fund-out');
    const r = all.find((x) => String(x.id) === String(id));
    if (!r) return toast('记录不存在', true);
    openModal('编辑条款', `
      <form data-submit="update-fund" data-type="${type}" data-id="${id}">
        <div class="form-grid">
          <div class="field full"><label>款项名称 *</label><input class="input" name="name" value="${esc(r.name)}"></div>
          <div class="field full"><label>触发条件</label><input class="input" name="cond" value="${esc(r.cond || '')}"></div>
          <div class="field"><label>比例(%)</label><input class="input" type="number" step="0.01" name="ratio" value="${r.ratio}"></div>
          <div class="field"><label>金额(万)</label><input class="input" type="number" step="0.01" name="amount" value="${r.amount}"></div>
          <div class="field"><label>应收/应付日期</label><input class="input" type="date" name="plan_date" value="${esc(r.plan_date || '')}"></div>
          <div class="field"><label>实收/付日期</label><input class="input" type="date" name="recv_date" value="${esc(r.recv_date || '')}"></div>
          <div class="field"><label>发票号</label><input class="input" name="invoice" value="${esc(r.invoice || '')}"></div>
          <div class="field"><label>状态</label><select class="input" name="status">${Object.entries({planned:'未到期',due:'临近应收',received:'已到账',partial:'部分到账'}).map(([v,t])=>`<option value="${v}" ${r.status===v?'selected':''}>${t}</option>`).join('')}</select></div>
        </div>
      </form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'update-fund-btn' }]));
  }

  async function updateFund(form, type, id) {
    try {
      await api('/api/' + type + '/' + id, { method: 'PUT', body: JSON.stringify(readForm(form)) });
      toast('条款已更新');
      closeModal();
      await renderProjectDetail();
    } catch (e) { toast(e.message, true); }
  }

  async function handleDeleteFund(key) {
    openModal('删除确认', '<p>确认删除该条款吗？</p>',
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '确认删除', cls: 'danger', action: 'confirm-delete-fund', id: 'del-fund-btn' }]),
      () => { window._delFundKey = key; });
  }

  async function confirmDeleteFund() {
    const [type, id] = window._delFundKey.split(':');
    try {
      await api('/api/' + type + '/' + id, { method: 'DELETE' });
      toast('已删除');
      closeModal();
      await renderProjectDetail();
    } catch (e) { toast(e.message, true); }
  }

  async function handleNewContract(projectId) {
    openModal('新增后向合同', `
      <form data-submit="save-contract" data-id="${esc(projectId)}">
        <div class="form-grid">
          <div class="field full"><label>合同名称 *</label><input class="input" name="name"></div>
          <div class="field"><label>供应商</label><input class="input" name="supplier"></div>
          <div class="field"><label>可签约金额(万)</label><input class="input" type="number" step="0.01" name="signable" value="0"></div>
          <div class="field"><label>已签约金额(万)</label><input class="input" type="number" step="0.01" name="signed" value="0"></div>
          <div class="field"><label>已支付金额(万)</label><input class="input" type="number" step="0.01" name="paid" value="0"></div>
        </div>
      </form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'save-contract-btn' }]));
  }

  async function saveContract(form, projectId) {
    try {
      await api('/api/projects/' + projectId + '/sub-contracts', { method: 'POST', body: JSON.stringify(readForm(form)) });
      toast('合同已保存');
      closeModal();
      await renderProjectDetail();
    } catch (e) { toast(e.message, true); }
  }

  async function handleEditContract(id) {
    // 简化：从当前项目 finance 中查找
    const p = await getCurrentProject();
    if (!p) return;
    const data = await api('/api/projects/' + p.id + '/finance');
    const c = data.contracts.find((x) => String(x.id) === String(id));
    if (!c) return toast('合同不存在', true);
    openModal('编辑后向合同', `
      <form data-submit="update-contract" data-id="${id}">
        <div class="form-grid">
          <div class="field full"><label>合同名称 *</label><input class="input" name="name" value="${esc(c.name)}"></div>
          <div class="field"><label>供应商</label><input class="input" name="supplier" value="${esc(c.supplier || '')}"></div>
          <div class="field"><label>可签约金额(万)</label><input class="input" type="number" step="0.01" name="signable" value="${c.signable}"></div>
          <div class="field"><label>已签约金额(万)</label><input class="input" type="number" step="0.01" name="signed" value="${c.signed}"></div>
          <div class="field"><label>已支付金额(万)</label><input class="input" type="number" step="0.01" name="paid" value="${c.paid}"></div>
        </div>
      </form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'update-contract-btn' }]));
  }

  async function updateContract(form, id) {
    try {
      await api('/api/sub-contracts/' + id, { method: 'PUT', body: JSON.stringify(readForm(form)) });
      toast('合同已更新');
      closeModal();
      await renderProjectDetail();
    } catch (e) { toast(e.message, true); }
  }

  async function handleDeleteContract(id) {
    openModal('删除确认', '<p>确认删除该后向合同吗？</p>',
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '确认删除', cls: 'danger', action: 'confirm-delete-contract', id: 'del-contract-btn' }]),
      () => { window._delContractId = id; });
  }

  async function confirmDeleteContract() {
    try {
      await api('/api/sub-contracts/' + window._delContractId, { method: 'DELETE' });
      toast('已删除');
      closeModal();
      await renderProjectDetail();
    } catch (e) { toast(e.message, true); }
  }

  function docsHtml(project, folders) {
    return `<div class="grid" style="grid-template-columns:280px 1fr">
      <div class="card card-pad">
        <div class="space-between mb16"><h3 style="margin:0;font-size:15px">文档目录</h3>
          ${canWrite('doc') ? `<button class="btn sm" data-action="new-folder" data-id="${esc(project.id)}">${svg('plus')}</button>` : ''}</div>
        <div class="tree" id="folder-tree"></div>
      </div>
      <div class="card card-pad">
        <div class="space-between mb16"><h3 style="margin:0;font-size:15px" id="doc-panel-title">文档列表</h3>
          ${canWrite('doc') ? `<button class="btn sm primary" data-action="new-docfile">${svg('plus')} 上传/新建</button>` : ''}</div>
        <div id="doc-files"></div>
      </div>
    </div>`;
  }

  function bindFolderTree(projectId) {
    const tree = document.getElementById('folder-tree');
    if (!tree) return;
    api('/api/projects/' + projectId + '/folders').then((folders) => {
      window._folders = folders;
      tree.innerHTML = folderTreeHtml(folders, 0);
      const first = firstFolder(folders);
      if (first) selectFolder(first.id);
    });
  }

  function firstFolder(folders) {
    if (folders.length && folders[0].children.length) return folders[0].children[0];
    if (folders.length) return folders[0];
    return null;
  }

  function folderTreeHtml(folders, depth) {
    return folders.map((f) => `
      <div>
        <div class="node ${window._activeFolder === f.id ? 'active' : ''}" data-action="select-folder" data-id="${f.id}" style="padding-left:${8 + depth * 14}px">
          ${svg('folder')} <span class="flex1" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f.name)}</span>
          <span class="row-actions">
            ${canWrite('doc') ? `${iconBtn('edit-folder:' + f.id, 'edit', '重命名')}${iconBtn('delete-folder:' + f.id, 'trash', '删除', 'danger')}` : ''}
          </span>
        </div>
        ${f.children && f.children.length ? `<div class="children">${folderTreeHtml(f.children, depth + 1)}</div>` : ''}
      </div>`).join('');
  }

  async function selectFolder(id) {
    window._activeFolder = id;
    const tree = document.getElementById('folder-tree');
    if (tree) {
      tree.querySelectorAll('.node').forEach((n) => n.classList.toggle('active', Number(n.dataset.id) === Number(id)));
    }
    const panel = document.getElementById('doc-panel-title');
    const files = await api('/api/folders/' + id + '/files');
    const folder = findFolderById(window._folders || [], id);
    if (panel) panel.textContent = (folder ? folder.name : '') + ' · 文档列表';
    const fileEl = document.getElementById('doc-files');
    if (fileEl) fileEl.innerHTML = docFilesHtml(files);
  }

  function findFolderById(folders, id) {
    for (const f of folders) {
      if (Number(f.id) === Number(id)) return f;
      const c = findFolderById(f.children || [], id);
      if (c) return c;
    }
    return null;
  }

  function docFilesHtml(files) {
    if (!files.length) return '<div class="empty">该目录暂无文档</div>';
    return `<div class="table-wrap"><table class="table">
      <thead><tr><th>文件名</th><th>类型</th><th class="num">大小</th><th>上传时间</th><th>备注</th>${canWrite('doc')?'<th></th>':''}</tr></thead>
      <tbody>${files.map((f) => `
        <tr><td>${esc(f.name)} ${f.path ? `<a href="javascript:;" class="small" data-action="download" data-url="/api/doc-files/${f.id}/download" data-name="${esc(f.name)}">下载</a>` : ''}</td>
        <td>${esc(f.type || '')}</td><td class="num">${f.size ? (f.size > 1024 ? (f.size/1024).toFixed(1)+' KB' : f.size+' B') : ''}</td>
        <td>${esc(f.upload_time || '')}</td><td>${esc(f.note || '')}</td>
        ${canWrite('doc') ? `<td class="actions">${iconBtn('edit-docfile:' + f.id, 'edit', '编辑')}${iconBtn('delete-docfile:' + f.id, 'trash', '删除', 'danger')}</td>` : ''}
        </tr>`).join('')}</tbody>
    </table></div>`;
  }

  async function handleNewFolder(projectId) {
    openModal('新建目录', `
      <form data-submit="save-folder" data-id="${esc(projectId)}">
        <div class="field"><label>目录名称 *</label><input class="input" name="name"></div>
        <div class="field"><label>上级目录</label><select class="input" name="parent_id"><option value="">（根目录）</option>${(window._folders || []).map(f=>`<option value="${f.id}">${esc(f.name)}</option>`).join('')}</select></div>
      </form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'save-folder-btn' }]));
  }

  async function saveFolder(form, projectId) {
    try {
      const d = readForm(form);
      await api('/api/projects/' + projectId + '/folders', { method: 'POST', body: JSON.stringify({ name: d.name, parentId: d.parent_id || null }) });
      toast('目录已创建');
      closeModal();
      await refreshFolders(projectId);
    } catch (e) { toast(e.message, true); }
  }

  async function refreshFolders(projectId) {
    const folders = await api('/api/projects/' + projectId + '/folders');
    window._folders = folders;
    const tree = document.getElementById('folder-tree');
    if (tree) tree.innerHTML = folderTreeHtml(folders, 0);
  }

  async function handleEditFolder(id) {
    const folder = findFolderById(window._folders || [], id);
    if (!folder) return;
    openModal('重命名目录', `
      <form data-submit="update-folder" data-id="${id}">
        <div class="field"><label>目录名称 *</label><input class="input" name="name" value="${esc(folder.name)}"></div>
      </form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'update-folder-btn' }]));
  }

  async function updateFolder(form, id) {
    try {
      await api('/api/folders/' + id, { method: 'PUT', body: JSON.stringify({ name: readForm(form).name }) });
      toast('目录已更新');
      closeModal();
      const p = await getCurrentProject();
      if (p) await refreshFolders(p.id);
    } catch (e) { toast(e.message, true); }
  }

  async function handleDeleteFolder(id) {
    openModal('删除确认', '<p>确认删除该目录及其子目录、文件吗？</p>',
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '确认删除', cls: 'danger', action: 'confirm-delete-folder', id: 'del-folder-btn' }]),
      () => { window._delFolderId = id; });
  }

  async function confirmDeleteFolder() {
    try {
      await api('/api/folders/' + window._delFolderId, { method: 'DELETE' });
      toast('已删除');
      closeModal();
      const p = await getCurrentProject();
      if (p) await refreshFolders(p.id);
    } catch (e) { toast(e.message, true); }
  }

  async function handleNewDocfile() {
    const folderId = window._activeFolder;
    if (!folderId) return toast('请先选择目录', true);
    openModal('上传 / 新建文档', `
      <form data-submit="save-docfile" data-folder="${folderId}">
        <div class="field"><label>上传文件（可选）</label><input class="input" type="file" name="file"></div>
        <div class="field"><label>文件名（未上传文件时必填）</label><input class="input" name="name"></div>
        <div class="field"><label>类型</label><select class="input" name="type"><option value="pdf">pdf</option><option value="doc">doc</option><option value="xls">xls</option><option value="img">img</option><option value="other">other</option></select></div>
        <div class="field"><label>备注</label><input class="input" name="note"></div>
      </form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'save-docfile-btn' }]));
  }

  async function saveDocfile(form, folderId) {
    try {
      const fd = new FormData(form);
      const res = await fetch('/api/folders/' + folderId + '/files', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem(LS_TOKEN) },
        body: fd
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || '上传失败');
      }
      toast('文档已保存');
      closeModal();
      await selectFolder(folderId);
    } catch (e) { toast(e.message, true); }
  }

  async function handleEditDocfile(id) {
    const folderId = window._activeFolder;
    const files = await api('/api/folders/' + folderId + '/files');
    const f = files.find((x) => String(x.id) === String(id));
    if (!f) return toast('文档不存在', true);
    openModal('编辑文档', `
      <form data-submit="update-docfile" data-id="${id}">
        <div class="field"><label>文件名</label><input class="input" name="name" value="${esc(f.name)}"></div>
        <div class="field"><label>类型</label><input class="input" name="type" value="${esc(f.type || '')}"></div>
        <div class="field"><label>备注</label><input class="input" name="note" value="${esc(f.note || '')}"></div>
        <div class="field"><label><input type="checkbox" name="archived" ${f.archived?'checked':''}> 已归档（只读）</label></div>
      </form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'update-docfile-btn' }]));
  }

  async function updateDocfile(form, id) {
    try {
      await api('/api/doc-files/' + id, { method: 'PUT', body: JSON.stringify(readForm(form)) });
      toast('文档已更新');
      closeModal();
      await selectFolder(window._activeFolder);
    } catch (e) { toast(e.message, true); }
  }

  async function handleDeleteDocfile(id) {
    openModal('删除确认', '<p>确认删除该文档吗？</p>',
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '确认删除', cls: 'danger', action: 'confirm-delete-docfile', id: 'del-docfile-btn' }]),
      () => { window._delDocfileId = id; });
  }

  async function confirmDeleteDocfile() {
    try {
      await api('/api/doc-files/' + window._delDocfileId, { method: 'DELETE' });
      toast('已删除');
      closeModal();
      await selectFolder(window._activeFolder);
    } catch (e) { toast(e.message, true); }
  }

  async function handleRebuildFolders(projectId) {
    openModal('重建标准目录', '<p>将按南京分公司 DICT 标准目录重建该项目的文档目录树，并清空已有目录与文档，确认继续？</p>',
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '确认重建', cls: 'danger', action: 'confirm-rebuild-folders', id: 'rebuild-folders-btn' }]),
      () => { window._rebuildProjectId = projectId; });
  }

  async function confirmRebuildFolders() {
    try {
      await api('/api/projects/' + window._rebuildProjectId + '/folders/init', { method: 'POST', body: JSON.stringify({}) });
      toast('标准目录已重建');
      closeModal();
      await renderDocuments();
    } catch (e) { toast(e.message, true); }
  }

  function risksHtml(project, items, checks) {
    return `<div class="grid" style="grid-template-columns:1fr 1fr">
      <div class="card card-pad">
        <h3 style="margin:0 0 12px;font-size:15px">风险记录</h3>
        ${items.filter(r=>r.type==='risk').length ? items.filter(r=>r.type==='risk').map((r) => `
          <div style="padding:10px 0;border-bottom:1px solid var(--border)">
            <div class="row"><span class="tag red">高风险</span><b>${esc(r.project_name || '')}</b></div>
            <div class="small muted mt8">${esc(r.title || '')}</div>
            <div class="small muted">截止：${esc(r.due_date || '')}</div>
          </div>`).join('') : '<div class="empty">暂无风险记录</div>'}
      </div>
      <div class="card card-pad">
        <h3 style="margin:0 0 12px;font-size:15px">质量检查问题</h3>
        ${checks && checks.length ? checks.map(c=>`<div style="padding:8px 0;border-bottom:1px solid var(--border)">
          <div class="row"><span class="tag red">${esc(c.result)}</span><b>${esc(c.item)}</b></div>
          <div class="small muted">${esc(c.category||'')} · ${esc(c.checked_by||'')} · ${esc(c.checked_at||'')}</div>
        </div>`).join('') : '<div class="empty">暂无质检问题</div>'}
        <div class="divider"></div>
        <h3 style="margin:0 0 12px;font-size:15px">AI 风险审核</h3>
        <p class="small muted">上传合同文本，AI 将按固定清单进行红黄绿评级。</p>
        <textarea class="input" id="risk-text" rows="5" placeholder="粘贴合同条款文本…"></textarea>
        <div class="row mt16"><button class="btn primary" data-action="ai-risk-review">开始审核</button></div>
        <div id="risk-result" class="mt16"></div>
      </div>
    </div>`;
  }

  async function handleAiRiskReview() {
    const text = document.getElementById('risk-text').value;
    if (!text) return toast('请粘贴合同文本', true);
    const btn = document.querySelector('[data-action="ai-risk-review"]');
    if (btn) { btn.disabled = true; btn.textContent = '审核中…'; }
    try {
      const res = await api('/api/ai/risk-review', { method: 'POST', body: JSON.stringify({ text }) });
      const d = res.data || {};
      const color = d.rating === 'red' ? 'var(--risk-red)' : d.rating === 'yellow' ? 'var(--risk-yellow)' : 'var(--risk-green)';
      document.getElementById('risk-result').innerHTML = `
        <div style="font-weight:700;color:${color};">评级：${{red:'高风险',yellow:'关注',green:'正常'}[d.rating] || d.rating}</div>
        <p class="small">${esc(d.summary || '')}</p>
        ${(d.checklist || []).map(c=>`<div class="row"><span class="tag ${c.result==='通过'?'green':'yellow'}">${esc(c.result)}</span><span>${esc(c.item)}</span></div>`).join('')}
        <div class="ai-disclaimer">${esc(res.disclaimer || 'AI 识别仅供参考')}</div>`;
    } catch (e) { toast(e.message, true); }
    if (btn) { btn.disabled = false; btn.textContent = '开始审核'; }
  }

  function changesHtml(project, changes) {
    return `<div class="card card-pad">
      <h3 style="margin:0 0 12px;font-size:15px">变更记录</h3>
      ${changes && changes.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>变更类型</th><th>变更前</th><th>变更后</th><th>说明</th><th>变更人</th><th>时间</th></tr></thead>
        <tbody>${changes.map(c=>`<tr><td><span class="tag primary">${esc(c.change_type)}</span></td><td>${esc(c.before_value||'')}</td><td>${esc(c.after_value||'')}</td><td>${esc(c.detail||'')}</td><td>${esc(c.changed_by||'')}</td><td class="small">${esc(c.created_at||'')}</td></tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty">项目 ${esc(project.name)} 暂无变更记录</div>`}
    </div>`;
  }

  // ---------------- project stages ----------------
  async function renderProjectStages() {
    const project = await getCurrentProject();
    let ms = [];
    if (project) ms = await api('/api/projects/' + project.id + '/milestones');
    const groups = [['售前', '售前'], ['采购', '采购'], ['售中', '售中'], ['售后', '售后']];
    appShell(`
      ${viewTitle('项目三阶段流程', '售前→采购→售中→售后 · 12 步时间戳链，节点档案齐套后方可终验')}
      ${currentBanner(project)}
      ${project ? `
      <div class="card card-pad mb16"><div class="row" style="flex-wrap:wrap">
        ${ms.map(m=>`<span class="tag ${m.status==='done'?'green':(m.due_date&&m.due_date<today()?'red':'gray')}" title="${esc(m.name)} · ${esc(m.due_date||'')}">${m.seq}.${esc(m.name)}</span>`).join('')}
      </div></div>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        ${groups.map(([label, stage])=>`
          <div class="card card-pad">
            <h3 style="margin:0 0 12px;font-size:15px">${label}阶段</h3>
            ${ms.filter(m=>m.stage===stage).map(m=>{ const st = m.status==='done' ? ['已完成','green'] : (m.due_date && m.due_date < today() ? ['已逾期','red'] : ['未完成','yellow']);
              return `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
                <div class="space-between"><b>${m.seq}. ${esc(m.name)}</b><span class="tag ${st[1]}">${st[0]}</span></div>
                <div class="small muted">计划：${esc(m.due_date||'未定')}${m.done_date ? ' · 完成：' + esc(m.done_date) : ''}</div>
                <div class="small muted">必留档案：${(m.docs||[]).map(d=>esc(d)).join('、')}</div>
                ${canWrite('project') ? `<div class="mt8">${m.status==='done' ? `<button class="btn sm" data-action="ms-reset" data-id="${m.id}">重置</button>` : `<button class="btn sm primary" data-action="ms-done" data-id="${m.id}">标记完成</button>`}</div>` : ''}
              </div>`; }).join('') || '<div class="empty">该阶段暂无节点</div>'}
          </div>`).join('')}
      </div>
      ${stageQualityPanel(project)}
      ` : '<div class="empty">请先选择项目</div>'}
      <div class="grid mt16" style="grid-template-columns:1fr 1fr">
        <div class="card card-pad">
          <h3 style="margin:0 0 12px;font-size:15px">AI 字段抽取</h3>
          <textarea class="input" id="extract-text" rows="6" placeholder="粘贴合同/标书文本，AI 将抽取关键字段…"></textarea>
          <div class="row mt16"><button class="btn primary" data-action="ai-extract">AI 抽取字段</button></div>
          <div id="extract-result" class="mt16"></div>
        </div>
        <div class="card card-pad">
          <h3 style="margin:0 0 12px;font-size:15px">风险审核双轨</h3>
          <p class="small muted">AI 预审 + 人工复核，金额入账必须人工确认。</p>
          <textarea class="input" id="stage-risk-text" rows="4" placeholder="粘贴合同文本进行风险审核…"></textarea>
          <div class="row mt16"><button class="btn" data-action="stage-risk-review">AI 风险审核</button></div>
          <div id="stage-risk-result" class="mt16"></div>
        </div>
      </div>`);
  }

  function stageQualityPanel(project) {
    const rules = [
      ['开工', '百万级以上项目施工计划是否≥7个主任务'],
      ['开工', '总体实施方案是否有编制单位且与前向合同我方主体一致'],
      ['开工', '实施方案是否包含自有能力或与主营业务融合描述（≥100字）'],
      ['到货', '后向到货签收单是否有系统水印、双方签字、电信红章'],
      ['实施', '现场照片是否至少包含1名施工人员'],
      ['实施', '施工管控记录是否每30自然日至少2次（百万级）'],
      ['终验', '前向验收报告是否双方签字并盖章'],
      ['终验', '后向验收报告是否有水印、双方签字、盖章'],
      ['终验', '验收照片是否至少包含1名验收人员'],
      ['终验', '是否粘贴报障二维码并拍照留痕']
    ];
    return `<div class="card card-pad mt16">
      <div class="space-between mb16"><h3 style="margin:0;font-size:15px">AI 交付质检（交付质检助手规则）</h3><span class="muted small">质检结果将记入 PMO 管理 → 质量检查</span></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>环节</th><th>质检规则</th><th></th></tr></thead>
        <tbody>${rules.map(r=>`<tr><td><span class="tag primary">${esc(r[0])}</span></td><td>${esc(r[1])}</td>
          <td class="actions">${canWrite('project') ? `<button class="btn sm" data-action="qa-check" data-item="${esc(r[1])}" data-category="${esc(r[0])}" data-result="通过">通过</button><button class="btn sm danger" data-action="qa-check" data-item="${esc(r[1])}" data-category="${esc(r[0])}" data-result="不通过">不通过</button>` : ''}</td></tr>`).join('')}
        </tbody>
      </table></div>
    </div>`;
  }

  async function loadStageFiles(project) {
    if (!project) return;
    const el = document.getElementById('stage-files');
    const list = await api('/api/attachments?biz_type=stage&biz_id=' + project.id);
    el.innerHTML = list.length ? list.map(a=>`<div class="row" style="justify-content:space-between"><span>${svg('doc')} ${esc(a.file_name)}</span><a href="javascript:;" data-action="download" data-url="/api/attachments/${a.id}/download" data-name="${esc(a.file_name)}">下载</a></div>`).join('') : '<div class="empty">暂无上传文档</div>';
  }

  async function handleStageUpload() {
    const input = document.getElementById('stage-file');
    if (!input.files.length) return toast('请选择文件', true);
    const project = await getCurrentProject();
    if (!project) return toast('请先选择项目', true);
    const fd = new FormData();
    fd.append('file', input.files[0]);
    fd.append('biz_type', 'stage');
    fd.append('biz_id', project.id);
    try {
      const res = await fetch('/api/attachments', { method: 'POST', headers: { 'Authorization': 'Bearer ' + localStorage.getItem(LS_TOKEN) }, body: fd });
      if (!res.ok) throw new Error((await res.json().catch(()=>({}))).error || '上传失败');
      toast('文档已上传');
      input.value = '';
      loadStageFiles(project);
    } catch (e) { toast(e.message, true); }
  }

  async function handleDownload(el) {
    const url = el.dataset.url;
    const name = el.dataset.name || 'download';
    if (!url) return;
    try {
      const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + localStorage.getItem(LS_TOKEN) } });
      if (!res.ok) throw new Error('下载失败');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) { toast(e.message, true); }
  }

  async function handleAiExtract() {
    const text = document.getElementById('extract-text').value;
    if (!text) return toast('请粘贴合同/标书文本', true);
    const btn = document.querySelector('[data-action="ai-extract"]');
    btn.disabled = true; btn.textContent = '抽取中…';
    try {
      const res = await api('/api/ai/extract', { method: 'POST', body: JSON.stringify({ text }) });
      const d = res.data || {};
      document.getElementById('extract-result').innerHTML = `
        <div class="form-grid">
          <div class="field"><label>项目名称</label><div>${esc(d.projectName || '')}</div></div>
          <div class="field"><label>金额(万)</label><div>${esc(d.amount)}</div></div>
          <div class="field"><label>对方单位</label><div>${esc(d.unit || '')}</div></div>
          <div class="field"><label>工期</label><div>${esc(d.duration || '')}</div></div>
          <div class="field full"><label>付款方式</label><div>${esc(d.payment || '')}</div></div>
          <div class="field full"><label>备注</label><div>${esc(d.remark || '')}</div></div>
        </div>
        <div class="ai-disclaimer">${esc(res.disclaimer || 'AI 识别仅供参考')}</div>
        ${canWrite('project') ? `<button class="btn primary mt16" data-action="create-from-ai">用抽取结果新建项目</button>` : ''}`;
      window._extractData = d;
    } catch (e) { toast(e.message, true); }
    btn.disabled = false; btn.textContent = 'AI 抽取字段';
  }

  async function handleCreateFromAi() {
    const d = window._extractData || {};
    if (!d.projectName) return toast('未识别项目名称', true);
    try {
      const p = await api('/api/projects/from-ai', { method: 'POST', body: JSON.stringify(d) });
      toast('项目已创建：' + p.name);
      location.hash = '#/projects';
      await route();
    } catch (e) { toast(e.message, true); }
  }

  async function handleStageRiskReview() {
    const text = document.getElementById('stage-risk-text').value;
    if (!text) return toast('请粘贴合同文本', true);
    const res = await api('/api/ai/risk-review', { method: 'POST', body: JSON.stringify({ text }) });
    const d = res.data || {};
    document.getElementById('stage-risk-result').innerHTML = `<p class="small">${esc(d.summary || '')}</p><div class="ai-disclaimer">${esc(res.disclaimer || 'AI 识别仅供参考')}</div>`;
  }

  // ---------------- documents center ----------------
  async function renderDocuments() {
    const project = await getCurrentProject();
    if (!project) {
      appShell(`${viewTitle('文档中心', '标准目录与 AI 模板')}${currentBanner(null)}`);
      return;
    }
    const folders = await api('/api/projects/' + project.id + '/folders');
    appShell(`
      ${viewTitle('文档中心', 'DICT 标准目录 + 文档表格行内增删改 + AI 模板', canWrite('doc') ? `<button class="btn" data-action="rebuild-folders" data-id="${esc(project.id)}">${svg('folder')} 重建标准目录</button>` : '')}
      ${currentBanner(project)}
      <div class="grid" style="grid-template-columns:280px 1fr">
        <div class="card card-pad">
          <div class="space-between mb16"><h3 style="margin:0;font-size:15px">文档目录</h3>
            ${canWrite('doc') ? `<button class="btn sm" data-action="new-folder" data-id="${esc(project.id)}">${svg('plus')}</button>` : ''}</div>
          <div class="tree" id="folder-tree"></div>
        </div>
        <div class="card card-pad">
          <div class="space-between mb16"><h3 style="margin:0;font-size:15px" id="doc-panel-title">文档列表</h3>
            ${canWrite('doc') ? `<button class="btn sm primary" data-action="new-docfile">${svg('plus')} 上传/新建</button>` : ''}</div>
          <div id="doc-files"></div>
        </div>
      </div>
      <div class="card card-pad mt16">
        <h3 style="margin:0 0 12px;font-size:15px">AI 文档模板</h3>
        <div class="row" style="flex-wrap:wrap">
          ${['info','daily','weekly','milestone','acceptance'].map(t=>`<button class="btn" data-action="ai-doc-template" data-tpl="${t}">${{info:'项目信息表',daily:'项目日报',weekly:'项目周报',milestone:'里程碑报告',acceptance:'验收报告'}[t]}</button>`).join('')}
        </div>
        <div id="ai-doc-result" class="mt16"></div>
      </div>`);
    window._folders = folders;
    const tree = document.getElementById('folder-tree');
    tree.innerHTML = folderTreeHtml(folders, 0);
    const first = firstFolder(folders);
    if (first) selectFolder(first.id);
  }

  async function handleAiDocTemplate(tpl) {
    const project = await getCurrentProject();
    if (!project) return toast('请先选择项目', true);
    const res = await api('/api/ai/doc-gen', { method: 'POST', body: JSON.stringify({ templateKey: tpl, projectId: project.id }) });
    const d = res.data || {};
    document.getElementById('ai-doc-result').innerHTML = `
      <div class="space-between"><b>${esc(d.title || '')}</b><span class="tag primary">AI 生成</span></div>
      <p class="small mt8">${esc(d.generated || '')}</p>
      ${res.file ? `<div class="mt8"><button class="btn sm primary" data-action="download" data-url="${esc(res.file.downloadUrl)}" data-name="${esc(res.file.name)}">下载 DOCX：${esc(res.file.name)}</button></div>` : ''}
      <div class="ai-disclaimer">${esc(res.disclaimer || 'AI 生成内容请人工复核')}</div>`;
  }

  // ---------------- contract management ----------------
  async function renderContracts() {
    const tab = window._contractTab || 'all';
    const projects = await api('/api/projects');
    if (!window._contractProjectId) {
      window._contractProjectId = currentProjectId || 'all';
    }
    const pid = window._contractProjectId;
    const qs = pid && pid !== 'all' ? '?projectId=' + encodeURIComponent(pid) : '';
    const [contracts, plans] = await Promise.all([api('/api/contracts' + qs), api('/api/contracts/plans' + qs)]);
    const selectedProject = projects.find((p) => p.id === pid);
    appShell(`
      ${viewTitle('合同管理', '按项目分类查看单项目合同视图，付款计划与资金台账联动', canWrite('contract') ? `<button class="btn primary" data-action="new-back-contract">${svg('plus')} 新增后向合同</button>` : '')}
      <div class="card card-pad mb16">
        <div class="row" style="flex-wrap:wrap">
          <label style="font-weight:600;flex:none">项目分类：</label>
          <select class="input" id="contract-project" style="width:280px">
            <option value="all" ${pid==='all'?'selected':''}>全部项目</option>
            ${projects.map(p=>`<option value="${esc(p.id)}" ${pid===p.id?'selected':''}>${esc(p.name)}（${esc(p.project_no||p.id)}）</option>`).join('')}
          </select>
          <span class="tag primary">${pid==='all' ? '全部项目视图' : '单项目视图'}</span>
          ${selectedProject ? `<span class="muted small">${esc(selectedProject.name)} · ${esc(selectedProject.customer_name||selectedProject.unit||'')}</span>` : ''}
        </div>
      </div>
      <div class="tabs">
        ${[['all','全部合同'],['forward','前向合同'],['backward','后向合同'],['plans','付款计划']].map(([k,label])=>`<button class="tab ${tab===k?'active':''}" data-action="contract-tab" data-tab="${k}">${label}</button>`).join('')}
      </div>
      <div id="contract-body"></div>`);
    const body = document.getElementById('contract-body');
    if (tab === 'plans') {
      body.innerHTML = `<div class="card table-wrap"><table class="table">
        <thead><tr><th>方向</th><th>款项名称</th><th>关联项目</th><th class="num">金额(万)</th><th>计划日期</th><th>实收/付日期</th><th>状态</th></tr></thead>
        <tbody>${plans.map(r=>{ const st=statusInfo(r.status); return `<tr>
          <td><span class="tag ${r.direction==='forward'?'primary':'amount'}">${r.direction==='forward'?'前向回款':'后向支付'}</span></td>
          <td>${esc(r.name)}</td><td>${esc(r.project_name||'')}</td>
          <td class="num amount">${num(r.amount)}</td><td>${esc(r.plan_date||'')}</td><td>${esc(r.recv_date||'')}</td>
          <td><span class="tag ${st.cls}">${st.txt}</span></td></tr>`; }).join('')}</tbody>
      </table></div>`;
      return;
    }
    const list = tab === 'all' ? contracts : contracts.filter((c) => c.direction === tab);
    body.innerHTML = `<div class="card table-wrap"><table class="table">
      <thead><tr><th>方向</th><th>合同编码</th><th>合同名称</th><th>对方</th><th class="num">金额(万)</th><th>签约时间</th><th>关联项目</th>${canWrite('contract')?'<th></th>':''}</tr></thead>
      <tbody>${list.map(c=>`
        <tr>
          <td><span class="tag ${c.direction==='forward'?'primary':'amount'}">${c.direction==='forward'?'前向':'后向'}</span></td>
          <td>${esc(c.code||'')}</td><td><b>${esc(c.name)}</b></td><td>${esc(c.partner||'')}</td>
          <td class="num amount">${num(c.amount)}</td><td>${esc(c.sign_date||'')}</td><td>${esc(c.project_name||'')}</td>
          ${canWrite('contract') ? `<td class="actions">${c.direction==='backward'
            ? `${iconBtn('edit-back-contract:' + c.rawId, 'edit', '编辑')}${iconBtn('delete-back-contract:' + c.rawId, 'trash', '删除', 'danger')}`
            : iconBtn('edit-front-contract:' + c.project_id, 'edit', '编辑前向合同')}
            ${iconBtn('contract-files:' + c.direction + ':' + (c.direction==='forward' ? c.project_id : c.rawId), 'folder', '合同附件')}</td>` : `<td class="actions">${iconBtn('contract-files:' + c.direction + ':' + (c.direction==='forward' ? c.project_id : c.rawId), 'folder', '合同附件')}</td>`}
        </tr>`).join('')}</tbody>
    </table></div>`;
  }

  async function handleNewBackContract() {
    const projects = await api('/api/projects');
    const selected = (window._contractProjectId && window._contractProjectId !== 'all') ? window._contractProjectId : (currentProjectId || (projects[0] && projects[0].id));
    openModal('新增后向合同', `
      <form data-submit="save-back-contract">
        <div class="form-grid">
          <div class="field"><label>关联项目 *</label><select class="input" name="project_id">${projects.map(p=>`<option value="${esc(p.id)}" ${selected===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>
          <div class="field"><label>合同编码</label><input class="input" name="code"></div>
          <div class="field full"><label>合同名称 *</label><input class="input" name="name"></div>
          <div class="field"><label>后向单位名称</label><input class="input" name="supplier"></div>
          <div class="field"><label>可签约金额(万)</label><input class="input" type="number" step="0.01" name="signable" value="0"></div>
          <div class="field"><label>已签约金额(万)</label><input class="input" type="number" step="0.01" name="signed" value="0"></div>
          <div class="field"><label>已支付金额(万)</label><input class="input" type="number" step="0.01" name="paid" value="0"></div>
          <div class="field"><label>签约时间</label><input class="input" type="date" name="sign_date"></div>
        </div>
      </form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'save-back-contract-btn' }]));
  }

  async function saveBackContract(form) {
    try {
      await api('/api/contracts/backward', { method: 'POST', body: JSON.stringify(readForm(form)) });
      toast('后向合同已保存');
      closeModal();
      await renderContracts();
    } catch (e) { toast(e.message, true); }
  }

  async function handleEditBackContract(id) {
    const projects = await api('/api/projects');
    const list = await api('/api/contracts?direction=backward');
    const c = list.find((x) => String(x.rawId) === String(id));
    if (!c) return toast('合同不存在', true);
    openModal('编辑后向合同', `
      <form data-submit="update-back-contract" data-id="${id}">
        <div class="form-grid">
          <div class="field"><label>关联项目</label><select class="input" name="project_id" disabled>${projects.map(p=>`<option value="${esc(p.id)}" ${p.id===c.project_id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>
          <div class="field"><label>合同编码</label><input class="input" name="code" value="${esc(c.code||'')}"></div>
          <div class="field full"><label>合同名称 *</label><input class="input" name="name" value="${esc(c.name)}"></div>
          <div class="field"><label>后向单位名称</label><input class="input" name="supplier" value="${esc(c.partner||'')}"></div>
          <div class="field"><label>可签约金额(万)</label><input class="input" type="number" step="0.01" name="signable" value="${c.amount}"></div>
          <div class="field"><label>已签约金额(万)</label><input class="input" type="number" step="0.01" name="signed" value="${c.signed||0}"></div>
          <div class="field"><label>已支付金额(万)</label><input class="input" type="number" step="0.01" name="paid" value="${c.paid||0}"></div>
          <div class="field"><label>签约时间</label><input class="input" type="date" name="sign_date" value="${esc(c.sign_date||'')}"></div>
        </div>
      </form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'update-back-contract-btn' }]));
  }

  async function updateBackContract(form, id) {
    try {
      await api('/api/contracts/backward/' + id, { method: 'PUT', body: JSON.stringify(readForm(form)) });
      toast('后向合同已更新');
      closeModal();
      await renderContracts();
    } catch (e) { toast(e.message, true); }
  }

  async function handleDeleteBackContract(id) {
    openModal('删除确认', '<p>确认删除该后向合同吗？</p>',
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '确认删除', cls: 'danger', action: 'confirm-delete-back-contract', id: 'del-back-contract-btn' }]),
      () => { window._delBackContractId = id; });
  }

  async function confirmDeleteBackContract() {
    try {
      await api('/api/contracts/backward/' + window._delBackContractId, { method: 'DELETE' });
      toast('已删除');
      closeModal();
      await renderContracts();
    } catch (e) { toast(e.message, true); }
  }

  async function handleEditFrontContract(projectId) {
    const list = await api('/api/contracts?direction=forward');
    const c = list.find((x) => x.project_id === projectId);
    if (!c) return toast('前向合同不存在', true);
    const p = await api('/api/projects/' + projectId);
    openModal('编辑前向合同', `
      <form data-submit="update-front-contract" data-id="${esc(projectId)}">
        <div class="form-grid">
          <div class="field"><label>前向合同编码</label><input class="input" name="forward_contract_code" value="${esc(p.forward_contract_code||'')}"></div>
          <div class="field"><label>前向合同名称</label><input class="input" name="forward_contract_name" value="${esc(p.forward_contract_name||'')}"></div>
          <div class="field"><label>前向签约金额(万)</label><input class="input" type="number" step="0.01" name="forward_contract_amount" value="${p.forward_contract_amount||0}"></div>
          <div class="field"><label>前向签约时间</label><input class="input" type="date" name="forward_sign_date" value="${esc(p.forward_sign_date||'')}"></div>
        </div>
      </form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'update-front-contract-btn' }]));
  }

  async function updateFrontContract(form, projectId) {
    try {
      await api('/api/contracts/forward/' + projectId, { method: 'PUT', body: JSON.stringify(readForm(form)) });
      toast('前向合同已更新');
      closeModal();
      await renderContracts();
    } catch (e) { toast(e.message, true); }
  }

  async function handleContractFiles(key) {
    const [direction, id] = key.split(':');
    openModal('合同附件与操作记录', `
      <div class="space-between mb16">
        <div class="small muted">支持上传合同扫描件、合同清单、报价单、签收单等附件；PDF/图片可在线查看。</div>
        <div class="row">
          ${canWrite('contract') ? `<button class="btn primary sm" data-action="analyze-contract">AI 分析合同条款</button>` : ''}
          ${canWrite('contract') ? `<label class="btn sm" style="cursor:pointer">${svg('plus')} 上传附件<input type="file" id="contract-file-input" style="display:none"></label>` : ''}
        </div>
      </div>
      <div id="contract-analysis"></div>
      <div id="contract-files-list"></div>
      <div class="divider"></div>
      <h3 style="margin:0 0 8px;font-size:14px">操作记录</h3>
      <div id="contract-files-log"></div>`,
      modalButtons([{ label: '关闭', action: 'modal-close' }]));
    window._contractFilesKey = { direction, id };
    await loadContractFilesModal(direction, id);
  }

  async function loadContractFilesModal(direction, id) {
    const [files, logs, analysis] = await Promise.all([
      api(`/api/contracts/${direction}/${id}/files`),
      api(`/api/contracts/${direction}/${id}/logs`),
      api(`/api/contracts/${direction}/${id}/analysis`).catch(() => null)
    ]);
    const listEl = document.getElementById('contract-files-list');
    const logEl = document.getElementById('contract-files-log');
    const anaEl = document.getElementById('contract-analysis');
    if (anaEl) {
      if (analysis) {
        const riskColor = { red: 'var(--risk-red)', yellow: 'var(--risk-yellow)', green: 'var(--risk-green)' }[analysis.risk_level] || 'var(--text-secondary)';
        anaEl.innerHTML = `<div class="card card-pad mb16" style="border-color:var(--primary-subtle)">
          <div class="space-between"><b>${svg('doc')} ${esc(analysis.title || '合同重要条款分析')}</b><span class="tag" style="background:${riskColor}1a;color:${riskColor}">${analysis.risk_level === 'red' ? '高风险' : analysis.risk_level === 'yellow' ? '关注' : '正常'}</span></div>
          <p class="small muted mt8">${esc(analysis.summary || '')}</p>
          ${(analysis.clauses || []).map(c=>`<div style="padding:8px 0;border-bottom:1px solid var(--border)"><span class="tag primary">${esc(c.category||'条款')}</span>
            <div class="mt8"><b>${esc(c.name||'')}</b></div><div class="small">${esc(c.content||'')}</div></div>`).join('')}
          <div class="small muted mt8">分析时间：${esc(analysis.created_at||'')} · 模型：${esc(analysis.model||'本地规则引擎')}</div>
        </div>`;
      } else {
        anaEl.innerHTML = `<div class="banner" style="margin-bottom:16px">${svg('warn')} <span>尚未进行 AI 分析，上传合同后点击「AI 分析合同条款」自动提取重要条款。</span></div>`;
      }
    }
    if (listEl) listEl.innerHTML = files.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>文件名</th><th>类型</th><th class="num">大小</th><th>上传人</th><th>时间</th><th></th></tr></thead>
      <tbody>${files.map(f=>`<tr><td>${svg('doc')} ${esc(f.file_name)}</td><td>${esc(f.file_type||'')}</td>
        <td class="num">${f.size ? (f.size>1024 ? (f.size/1024).toFixed(1)+' KB' : f.size+' B') : ''}</td>
        <td>${esc(f.uploader||'')}</td><td class="small">${esc(f.uploaded_at||'')}</td>
        <td class="actions">
          ${canPreview(f.file_type) ? `<button class="btn sm" data-action="preview-file" data-id="${f.id}">在线查看</button>` : ''}
          <button class="btn sm" data-action="download" data-url="/api/contract-files/${f.id}/download" data-name="${esc(f.file_name)}">下载</button>
          ${canWrite('contract') ? iconBtn('delete-contract-file:' + f.id, 'trash', '删除', 'danger') : ''}
        </td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">暂无附件，请上传合同扫描件、合同清单等</div>';
    if (logEl) logEl.innerHTML = logs.length ? logs.map(l=>`<div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
      <div class="flex1"><span class="tag gray">${esc(l.action)}</span> <span>${esc(l.detail||'')}</span></div>
      <span class="small muted">${esc(l.operator||'')} · ${esc(l.created_at||'')}</span></div>`).join('') : '<div class="empty">暂无操作记录</div>';
  }

  function canPreview(type) {
    return ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp'].includes((type || '').toLowerCase());
  }

  async function uploadContractFile(input) {
    const key = window._contractFilesKey;
    if (!key || !input.files.length) return;
    const fd = new FormData();
    fd.append('file', input.files[0]);
    try {
      const res = await fetch(`/api/contracts/${key.direction}/${key.id}/files`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem(LS_TOKEN) },
        body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传失败');
      toast('附件已上传');
      input.value = '';
      await loadContractFilesModal(key.direction, key.id);
      await handleAnalyzeContract();
    } catch (e) { toast(e.message, true); }
  }

  async function handleAnalyzeContract() {
    const key = window._contractFilesKey;
    if (!key) return;
    try {
      toast('AI 正在分析合同条款…');
      await api(`/api/contracts/${key.direction}/${key.id}/analyze`, { method: 'POST', body: JSON.stringify({}) });
      toast('合同条款分析完成');
      await loadContractFilesModal(key.direction, key.id);
    } catch (e) { toast(e.message, true); }
  }

  async function previewContractFile(id) {
    try {
      const res = await fetch('/api/contract-files/' + id + '/view', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem(LS_TOKEN) } });
      if (!res.ok) throw new Error('预览失败');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { toast(e.message, true); }
  }

  async function handleDeleteContractFile(id) {
    openModal('删除确认', '<p>确认删除该附件吗？删除后将同步写入操作记录。</p>',
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '确认删除', cls: 'danger', action: 'confirm-delete-contract-file', id: 'del-contract-file-btn' }]),
      () => { window._delContractFileId = id; });
  }

  async function confirmDeleteContractFile() {
    try {
      await api('/api/contract-files/' + window._delContractFileId, { method: 'DELETE' });
      toast('附件已删除');
      closeModal();
      const key = window._contractFilesKey;
      if (key) await handleContractFiles(key.direction + ':' + key.id);
    } catch (e) { toast(e.message, true); }
  }

  // ---------------- template management ----------------
  async function renderTemplates() {
    const type = window._templateType || 'doc';
    const list = await api('/api/templates?type=' + type);
    appShell(`
      ${viewTitle('模板管理', '文档 / 项目 / 合同模板统一管理与版本控制', canWrite('template') ? `<button class="btn primary" data-action="new-template">${svg('plus')} 新增模板</button>` : '')}
      <div class="tabs">
        ${[['doc','文档模板'],['project','项目模板'],['contract','合同模板']].map(([k,label])=>`<button class="tab ${type===k?'active':''}" data-action="template-tab" data-tab="${k}">${label}</button>`).join('')}
      </div>
      <div class="card table-wrap"><table class="table">
        <thead><tr><th>模板名称</th><th>说明</th><th>版本</th><th>文件</th><th>更新时间</th>${canWrite('template')?'<th></th>':''}</tr></thead>
        <tbody>${list.map(t=>`
          <tr><td><b>${esc(t.name)}</b></td><td class="muted">${esc(t.description||'')}</td>
          <td><span class="tag primary">V${t.version||1}</span></td>
          <td>${t.path ? `<a href="javascript:;" data-action="download" data-url="/api/templates/${t.id}/download" data-name="${esc(t.file_name||t.name)}">${esc(t.file_name||'')}</a>` : '<span class="muted">未上传文件</span>'}</td>
          <td class="small muted">${esc(t.updated_at||'')}</td>
          ${canWrite('template') ? `<td class="actions">${iconBtn('edit-template:' + t.id, 'edit', '编辑')}${iconBtn('delete-template:' + t.id, 'trash', '删除', 'danger')}</td>` : ''}
          </tr>`).join('')}
        </tbody>
      </table></div>`);
  }

  async function handleNewTemplate() {
    openModal('新增模板', templateFormHtml(null),
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'save-template-btn' }]));
  }

  function templateFormHtml(t) {
    const v = t || {};
    return `
      <form data-submit="${t ? 'update-template' : 'save-template'}" ${t ? `data-id="${esc(t.id)}"` : ''}>
        <div class="form-grid">
          <div class="field"><label>模板类型</label><select class="input" name="type">
            <option value="doc" ${v.type==='doc'?'selected':''}>文档模板</option>
            <option value="project" ${v.type==='project'?'selected':''}>项目模板</option>
            <option value="contract" ${v.type==='contract'?'selected':''}>合同模板</option>
          </select></div>
          <div class="field"><label>模板名称 *</label><input class="input" name="name" value="${esc(v.name||'')}"></div>
          <div class="field full"><label>说明</label><input class="input" name="description" value="${esc(v.description||'')}"></div>
          <div class="field full"><label>上传模板文件${t ? '（替换后版本号 +1）' : ''}</label><input class="input" type="file" name="file"></div>
        </div>
      </form>`;
  }

  async function saveTemplate(form) {
    try {
      const fd = new FormData(form);
      const res = await fetch('/api/templates', { method: 'POST', headers: { 'Authorization': 'Bearer ' + localStorage.getItem(LS_TOKEN) }, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      toast('模板已保存');
      closeModal();
      await renderTemplates();
    } catch (e) { toast(e.message, true); }
  }

  async function handleEditTemplate(id) {
    const list = await api('/api/templates?type=' + (window._templateType || 'doc'));
    const t = list.find((x) => String(x.id) === String(id));
    if (!t) return toast('模板不存在', true);
    openModal('编辑模板', templateFormHtml(t),
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'update-template-btn' }]));
  }

  async function updateTemplate(form, id) {
    try {
      const fd = new FormData(form);
      const res = await fetch('/api/templates/' + id, { method: 'PUT', headers: { 'Authorization': 'Bearer ' + localStorage.getItem(LS_TOKEN) }, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      toast('模板已更新');
      closeModal();
      await renderTemplates();
    } catch (e) { toast(e.message, true); }
  }

  async function handleDeleteTemplate(id) {
    openModal('删除确认', '<p>确认删除该模板吗？</p>',
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '确认删除', cls: 'danger', action: 'confirm-delete-template', id: 'del-template-btn' }]),
      () => { window._delTemplateId = id; });
  }

  async function confirmDeleteTemplate() {
    try {
      await api('/api/templates/' + window._delTemplateId, { method: 'DELETE' });
      toast('已删除');
      closeModal();
      await renderTemplates();
    } catch (e) { toast(e.message, true); }
  }

  // ---------------- PMO management（重新设计：组合总览 / 一会八表 / 里程碑管控 / 质量检查 / 送审进度 / 变更台账 / 成员） ----------------
  async function renderPmo() {
    const data = await api('/api/pmo/summary');
    const tab = window._pmoTab || 'overview';
    appShell(`
      ${viewTitle('PMO 管理', '按虎翼虎嗅 PMO 管理细则、一会八表、三必做与 AI 质检要求重设计')}
      <div class="tabs">
        ${[['overview','组合总览'],['eight','一会八表'],['milestones','里程碑管控'],['checks','质量检查'],['audits','送审进度'],['changes','变更台账'],['members','成员与分工']].map(([k,label])=>`<button class="tab ${tab===k?'active':''}" data-action="pmo-tab" data-tab="${k}">${label}</button>`).join('')}
      </div>
      <div id="pmo-body"></div>`);
    const body = document.getElementById('pmo-body');
    if (tab === 'overview') body.innerHTML = pmoOverviewHtml(data);
    else if (tab === 'eight') body.innerHTML = pmoEightHtml(data);
    else if (tab === 'milestones') body.innerHTML = pmoMilestonesHtml(data);
    else if (tab === 'checks') body.innerHTML = pmoChecksHtml(data);
    else if (tab === 'audits') body.innerHTML = pmoAuditsHtml(data);
    else if (tab === 'changes') body.innerHTML = pmoChangesHtml(data);
    else body.innerHTML = pmoMembersHtml(data);
  }

  function pmoOverviewHtml(data) {
    const t = data.totals;
    return `
      <div class="grid stat-grid mb16">
        ${statCard('在管项目', num(t.projectCount), '个', '风险 ' + t.riskCount + ' 个')}
        ${statCard('百万级项目', num(t.millionCount), '个', '100万以上升级管控')}
        ${statCard('500万+项目', num(t.over500Count), '个', '重大风险专项')}
        ${statCard('超期180天', num(t.overdue180Count), '个', '专项跟踪')}
        ${statCard('收入欠费', num(t.debtTotal), '万', '应收未收')}
        ${statCard('送审待办', num(t.auditPending), '项', '检查待办 ' + t.checkPending + ' 项')}
      </div>
      <div class="split">
        <div class="card card-pad">
          <h3 style="margin:0 0 12px;font-size:15px">按 PM 汇总</h3>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>PM</th><th class="num">项目数</th><th class="num">风险项目</th><th class="num">合同总额(万)</th><th class="num">平均回款率</th></tr></thead>
            <tbody>${data.byPm.map(x=>`<tr><td><b>${esc(x.pm)}</b></td><td class="num">${x.count}</td><td class="num" style="color:${x.riskCount?'var(--risk-red)':'inherit'}">${x.riskCount}</td><td class="num">${num(x.totalAmount)}</td><td class="num">${num(x.avgRatio)}%</td></tr>`).join('')}</tbody>
          </table></div>
        </div>
        <div class="card card-pad">
          <h3 style="margin:0 0 12px;font-size:15px">风险项目</h3>
          ${data.risks.length ? data.risks.map(r=>`<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)"><div class="flex1"><b>${esc(r.name)}</b><div class="small muted">${esc(r.remark||'')}</div></div><span class="tag ${r.risk==='red'?'red':'yellow'}">${riskInfo(r.risk).txt}</span></div>`).join('') : '<div class="empty">暂无风险项目</div>'}
        </div>
      </div>
      <div class="card card-pad mt16">
        <h3 style="margin:0 0 12px;font-size:15px">里程碑预警（逾期 / 14天内）</h3>
        <div class="grid" style="grid-template-columns:1fr 1fr">
          <div>${data.overdueMilestones.length ? data.overdueMilestones.map(m=>`<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)"><div><b>${esc(m.name)}</b><div class="small muted">${esc(m.project_name)} · ${esc(m.due_date)}</div></div><span class="tag red">已逾期</span></div>`).join('') : '<div class="empty">暂无逾期节点</div>'}</div>
          <div>${data.upcomingMilestones.length ? data.upcomingMilestones.map(m=>`<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)"><div><b>${esc(m.name)}</b><div class="small muted">${esc(m.project_name)} · ${esc(m.due_date)}</div></div><span class="tag yellow">临近</span></div>`).join('') : '<div class="empty">暂无临近节点</div>'}</div>
        </div>
      </div>`;
  }

  function pmoEightHtml(data) {
    const key = window._pmoTableKey || 't1';
    const meta = { t1: '表1 100-500万项目进度跟踪表', t2: '表2 500万以上重大项目风险表', t3: '表3 超期180天项目进度跟踪表', t4: '表4 项目质量检查表', t5: '表5 项目送审进度表', t6: '表6 收入跟踪表', t7: '表7 存量项目收入和欠费跟踪表', t8: '表8 项目变更跟踪表' };
    const t = data.eightTables;
    let thead = '', rowsHtml = '';
    if (key === 't4') {
      thead = '<tr><th>项目</th><th>类别</th><th>检查项</th><th>结果</th><th>检查人</th><th>时间</th></tr>';
      rowsHtml = t.t4.map(c=>`<tr><td>${esc(c.project_name||'')}</td><td>${esc(c.category||'')}</td><td>${esc(c.item)}</td><td><span class="tag ${c.result==='通过'?'green':c.result==='不通过'?'red':'yellow'}">${esc(c.result||'待检查')}</span></td><td>${esc(c.checked_by||'')}</td><td class="small">${esc(c.checked_at||'')}</td></tr>`).join('');
    } else if (key === 't5') {
      thead = '<tr><th>项目</th><th>方向</th><th>类型</th><th>条款</th><th>计划送审</th><th>完成时间</th><th>状态</th></tr>';
      rowsHtml = t.t5.map(a=>`<tr><td>${esc(a.project_name||'')}</td><td>${a.direction==='forward'?'前向':'后向'}</td><td>${esc(a.audit_type||'')}</td><td>${esc(a.clause||'')}</td><td>${esc(a.plan_date||'')}</td><td>${esc(a.done_date||'')}</td><td>${esc(a.status||'')}</td></tr>`).join('');
    } else if (key === 't8') {
      thead = '<tr><th>项目</th><th>变更类型</th><th>变更前</th><th>变更后</th><th>说明</th><th>变更人</th><th>时间</th></tr>';
      rowsHtml = t.t8.map(c=>`<tr><td>${esc(c.project_name||'')}</td><td><span class="tag primary">${esc(c.change_type)}</span></td><td>${esc(c.before_value||'')}</td><td>${esc(c.after_value||'')}</td><td>${esc(c.detail||'')}</td><td>${esc(c.changed_by||'')}</td><td class="small">${esc(c.created_at||'')}</td></tr>`).join('');
    } else if (key === 't6') {
      thead = '<tr><th>项目</th><th>客户</th><th>PM</th><th class="num">合同金额(万)</th><th>收入类型</th><th>净额/全额</th><th>当前里程碑</th><th>下一里程碑</th><th>预计时间</th><th>截止</th></tr>';
      rowsHtml = t.t6.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.unit||'')}</td><td>${esc(p.pm||'')}</td><td class="num amount">${num(p.amount)}</td><td>${esc(p.income_type||'')}</td><td>${esc(p.net_or_full||'')}</td><td>${esc(p.milestone||'')}</td><td>${esc(p.next_milestone||'')}</td><td>${esc(p.next_milestone_date||'')}</td><td>${esc(p.deadline||'')}</td></tr>`).join('');
    } else if (key === 't7') {
      thead = '<tr><th>项目</th><th>客户</th><th class="num">合同金额(万)</th><th class="num">已支付</th><th class="num">欠费</th><th class="num">回款率</th><th>预计终验</th></tr>';
      rowsHtml = t.t7.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.customer_name||p.unit||'')}</td><td class="num">${num(p.amount)}</td><td class="num">${num(p.paid)}</td><td class="num" style="color:var(--risk-red);font-weight:600">${num(p.debt)}</td><td class="num">${num(p.paymentRatio)}%</td><td>${esc(p.expected_acceptance_date||'')}</td></tr>`).join('');
    } else {
      thead = '<tr><th>项目编号</th><th>项目名称</th><th>客户</th><th class="num">金额(万)</th><th>类型</th><th>PM</th><th>截止</th><th>当前里程碑</th><th>下一里程碑</th><th>预计时间</th><th>延期函</th><th>进度</th></tr>';
      const list = key === 't1' ? t.t1 : key === 't2' ? t.t2 : t.t3;
      rowsHtml = list.map(p=>`<tr><td>${esc(p.project_no||p.id)}</td><td><b>${esc(p.name)}</b></td><td>${esc(p.customer_name||p.unit||'')}</td><td class="num amount">${num(p.amount)}</td><td>${esc(p.type||'')}</td><td>${esc(p.pm||'')}</td><td>${esc(p.deadline||'')}</td><td>${esc(p.milestone||'')}</td><td>${esc(p.next_milestone||'')}</td><td>${esc(p.next_milestone_date||'')}</td><td>${esc(p.delay_extension||'')}</td><td class="muted">${esc(p.progress||'')}</td></tr>`).join('');
    }
    return `<div class="card card-pad">
      <div class="row mb16" style="flex-wrap:wrap">
        ${Object.keys(meta).map(k=>`<button class="btn sm ${key===k?'primary':''}" data-action="pmo-table" data-key="${k}">${meta[k]}</button>`).join('')}
      </div>
      <div class="table-wrap"><table class="table"><thead>${thead}</thead><tbody>${rowsHtml || '<tr><td colspan="12" class="empty">暂无数据</td></tr>'}</tbody></table></div>
    </div>`;
  }

  function pmoMilestonesHtml(data) {
    const projects = data.eightTables.t6.map((p) => ({ id: p.id, name: p.name }));
    const pid = window._pmoMsProject || (projects[0] && projects[0].id) || '';
    const list = data.milestones.filter((m) => !pid || m.project_id === pid);
    const counts = { total: list.length, done: list.filter(m=>m.status==='done').length, overdue: list.filter(m=>m.status!=='done'&&m.due_date&&m.due_date<today()).length };
    return `<div class="card card-pad">
      <div class="row mb16"><label>项目：</label>
        <select class="input" id="pmo-ms-project" style="width:300px"><option value="">全部项目</option>${projects.map(p=>`<option value="${esc(p.id)}" ${pid===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select>
        <span class="tag primary">共 ${counts.total} 节点</span><span class="tag green">完成 ${counts.done}</span><span class="tag red">逾期 ${counts.overdue}</span>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th class="num">#</th><th>节点（12步时间戳链）</th><th>阶段</th><th>计划日期</th><th>实际完成</th><th>状态</th><th>必留档案</th>${canWrite('project')?'<th></th>':''}</tr></thead>
        <tbody>${list.map(m=>{ const st = m.status==='done' ? ['已完成','green'] : (m.due_date && m.due_date < today() ? ['已逾期','red'] : ['未完成','yellow']);
          return `<tr><td class="num">${m.seq}</td><td><b>${esc(m.name)}</b></td><td>${esc(m.stage)}</td><td>${esc(m.due_date||'')}</td><td>${esc(m.done_date||'')}</td><td><span class="tag ${st[1]}">${st[0]}</span></td>
          <td class="small muted">${(m.docs||[]).map(d=>esc(d)).join('、')}</td>
          ${canWrite('project') ? `<td class="actions">${m.status==='done' ? `<button class="btn sm" data-action="ms-reset" data-id="${m.id}">重置</button>` : `<button class="btn sm primary" data-action="ms-done" data-id="${m.id}">标记完成</button>`}</td>` : ''}</tr>`; }).join('')}
        </tbody>
      </table></div>
    </div>`;
  }

  function pmoChecksHtml(data) {
    return `<div class="card card-pad">
      <div class="space-between mb16"><h3 style="margin:0;font-size:15px">项目质量检查（三必做 / AI 质检）</h3>${canWrite('project') ? `<button class="btn sm primary" data-action="new-check">${svg('plus')} 新增检查</button>` : ''}</div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>项目</th><th>类别</th><th>检查项</th><th>结果</th><th>说明</th><th>检查人</th><th>时间</th>${canWrite('project')?'<th></th>':''}</tr></thead>
        <tbody>${data.checks.map(c=>`<tr><td>${esc(c.project_name||'')}</td><td>${esc(c.category||'')}</td><td>${esc(c.item)}</td>
          <td><span class="tag ${c.result==='通过'?'green':c.result==='不通过'?'red':'yellow'}">${esc(c.result||'待检查')}</span></td>
          <td class="muted">${esc(c.remark||'')}</td><td>${esc(c.checked_by||'')}</td><td class="small">${esc(c.checked_at||'')}</td>
          ${canWrite('project') ? `<td class="actions">${iconBtn('edit-check:' + c.id, 'edit', '编辑')}${iconBtn('delete-check:' + c.id, 'trash', '删除', 'danger')}</td>` : ''}</tr>`).join('')}
        </tbody>
      </table></div>
    </div>`;
  }

  function pmoAuditsHtml(data) {
    return `<div class="card card-pad">
      <div class="space-between mb16"><h3 style="margin:0;font-size:15px">项目送审进度（前后向审计）</h3>${canWrite('project') ? `<button class="btn sm primary" data-action="new-audit">${svg('plus')} 新增送审</button>` : ''}</div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>项目</th><th>方向</th><th>审计类型</th><th>条款</th><th>计划送审</th><th>完成时间</th><th>状态</th>${canWrite('project')?'<th></th>':''}</tr></thead>
        <tbody>${data.audits.map(a=>`<tr><td>${esc(a.project_name||'')}</td><td>${a.direction==='forward'?'前向':'后向'}</td><td>${esc(a.audit_type||'')}</td><td>${esc(a.clause||'')}</td><td>${esc(a.plan_date||'')}</td><td>${esc(a.done_date||'')}</td><td><span class="tag ${a.status==='已完成'?'green':'yellow'}">${esc(a.status||'')}</span></td>
          ${canWrite('project') ? `<td class="actions">${iconBtn('edit-audit:' + a.id, 'edit', '编辑')}${iconBtn('delete-audit:' + a.id, 'trash', '删除', 'danger')}</td>` : ''}</tr>`).join('')}
        </tbody>
      </table></div>
    </div>`;
  }

  function pmoChangesHtml(data) {
    return `<div class="card card-pad">
      <div class="space-between mb16"><h3 style="margin:0;font-size:15px">项目变更台账</h3>${canWrite('project') ? `<button class="btn sm primary" data-action="new-change">${svg('plus')} 新增变更</button>` : ''}</div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>项目</th><th>变更类型</th><th>变更前</th><th>变更后</th><th>说明</th><th>变更人</th><th>时间</th>${canWrite('project')?'<th></th>':''}</tr></thead>
        <tbody>${data.changes.map(c=>`<tr><td>${esc(c.project_name||'')}</td><td><span class="tag primary">${esc(c.change_type)}</span></td><td>${esc(c.before_value||'')}</td><td>${esc(c.after_value||'')}</td><td>${esc(c.detail||'')}</td><td>${esc(c.changed_by||'')}</td><td class="small">${esc(c.created_at||'')}</td>
          ${canWrite('project') ? `<td class="actions">${iconBtn('delete-change:' + c.id, 'trash', '删除', 'danger')}</td>` : ''}</tr>`).join('')}
        </tbody>
      </table></div>
    </div>`;
  }

  function pmoMembersHtml(data) {
    return `<div class="grid" style="grid-template-columns:1fr 1fr">
      <div class="card card-pad"><h3 style="margin:0 0 12px;font-size:15px">PMO 成员与权限</h3>
        ${data.members.map(m=>`<div class="row" style="padding:8px 0;border-bottom:1px solid var(--border)"><div class="avatar">${esc(m.name.slice(0,1))}</div><div class="flex1"><b>${esc(m.name)}</b><div class="small muted">${esc(m.username)}</div></div><span class="tag ${m.role==='admin'?'primary':'gray'}">${m.role==='admin'?'管理员':'只读'}</span></div>`).join('')}
      </div>
      <div class="card card-pad"><h3 style="margin:0 0 12px;font-size:15px">按 PM 分工</h3>
        <div class="table-wrap"><table class="table"><thead><tr><th>PM</th><th class="num">项目数</th><th class="num">风险</th><th class="num">合同额(万)</th></tr></thead>
        <tbody>${data.byPm.map(x=>`<tr><td><b>${esc(x.pm)}</b></td><td class="num">${x.count}</td><td class="num">${x.riskCount}</td><td class="num">${num(x.totalAmount)}</td></tr>`).join('')}</tbody></table></div>
      </div>
    </div>`;
  }

  // PMO 操作弹窗与处理
  async function pmoProjectOptions() {
    const projects = await api('/api/projects');
    return projects.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  }

  async function handleNewCheck() {
    const opts = await pmoProjectOptions();
    openModal('新增质量检查', `<form data-submit="save-check">
      <div class="form-grid">
        <div class="field"><label>项目 *</label><select class="input" name="project_id">${opts}</select></div>
        <div class="field"><label>类别</label><select class="input" name="category"><option>三必做</option><option>AI质检</option><option>六必有</option><option>其他</option></select></div>
        <div class="field full"><label>检查项 *</label><input class="input" name="item" placeholder="如：施工计划是否≥7个主任务"></div>
        <div class="field"><label>结果</label><select class="input" name="result"><option>待检查</option><option>通过</option><option>不通过</option></select></div>
        <div class="field full"><label>说明</label><input class="input" name="remark"></div>
      </div></form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'save-check-btn' }]));
  }
  async function saveCheck(form) { try { await api('/api/pmo/checks', { method: 'POST', body: JSON.stringify(readForm(form)) }); toast('已保存'); closeModal(); await renderPmo(); } catch (e) { toast(e.message, true); } }
  async function handleEditCheck(id) {
    const list = await api('/api/pmo/checks'); const c = list.find(x=>String(x.id)===String(id)); if (!c) return;
    openModal('编辑检查', `<form data-submit="update-check" data-id="${id}">
      <div class="form-grid">
        <div class="field"><label>类别</label><input class="input" name="category" value="${esc(c.category||'')}"></div>
        <div class="field"><label>结果</label><select class="input" name="result">${['待检查','通过','不通过'].map(r=>`<option ${c.result===r?'selected':''}>${r}</option>`).join('')}</select></div>
        <div class="field full"><label>检查项</label><input class="input" name="item" value="${esc(c.item)}"></div>
        <div class="field full"><label>说明</label><input class="input" name="remark" value="${esc(c.remark||'')}"></div>
      </div></form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'update-check-btn' }]));
  }
  async function updateCheck(form, id) { try { await api('/api/pmo/checks/' + id, { method: 'PUT', body: JSON.stringify(readForm(form)) }); toast('已更新'); closeModal(); await renderPmo(); } catch (e) { toast(e.message, true); } }
  async function handleDeleteCheck(id) { openModal('删除确认', '<p>确认删除该检查记录？</p>', modalButtons([{ label: '取消', action: 'modal-close' }, { label: '确认删除', cls: 'danger', action: 'confirm-delete-check', id: 'del-check-btn' }]), ()=>{ window._delCheckId = id; }); }
  async function confirmDeleteCheck() { try { await api('/api/pmo/checks/' + window._delCheckId, { method: 'DELETE' }); toast('已删除'); closeModal(); await renderPmo(); } catch (e) { toast(e.message, true); } }

  async function handleNewAudit() {
    const opts = await pmoProjectOptions();
    openModal('新增送审记录', `<form data-submit="save-audit">
      <div class="form-grid">
        <div class="field"><label>项目 *</label><select class="input" name="project_id">${opts}</select></div>
        <div class="field"><label>方向</label><select class="input" name="direction"><option value="forward">前向</option><option value="backward">后向</option></select></div>
        <div class="field"><label>审计类型</label><input class="input" name="audit_type" placeholder="必审/跟踪审计/结算审计"></div>
        <div class="field"><label>审计条款</label><input class="input" name="clause"></div>
        <div class="field"><label>计划送审时间</label><input class="input" type="date" name="plan_date"></div>
        <div class="field"><label>完成时间</label><input class="input" type="date" name="done_date"></div>
        <div class="field full"><label>状态</label><select class="input" name="status"><option>待送审</option><option>已送审</option><option>已完成</option></select></div>
      </div></form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'save-audit-btn' }]));
  }
  async function saveAudit(form) { try { await api('/api/pmo/audits', { method: 'POST', body: JSON.stringify(readForm(form)) }); toast('已保存'); closeModal(); await renderPmo(); } catch (e) { toast(e.message, true); } }
  async function handleEditAudit(id) {
    const list = await api('/api/pmo/audits'); const a = list.find(x=>String(x.id)===String(id)); if (!a) return;
    openModal('编辑送审', `<form data-submit="update-audit" data-id="${id}">
      <div class="form-grid">
        <div class="field"><label>方向</label><select class="input" name="direction"><option value="forward" ${a.direction==='forward'?'selected':''}>前向</option><option value="backward" ${a.direction==='backward'?'selected':''}>后向</option></select></div>
        <div class="field"><label>审计类型</label><input class="input" name="audit_type" value="${esc(a.audit_type||'')}"></div>
        <div class="field"><label>条款</label><input class="input" name="clause" value="${esc(a.clause||'')}"></div>
        <div class="field"><label>计划送审</label><input class="input" type="date" name="plan_date" value="${esc(a.plan_date||'')}"></div>
        <div class="field"><label>完成时间</label><input class="input" type="date" name="done_date" value="${esc(a.done_date||'')}"></div>
        <div class="field"><label>状态</label><select class="input" name="status">${['待送审','已送审','已完成'].map(s=>`<option ${a.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
      </div></form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'update-audit-btn' }]));
  }
  async function updateAudit(form, id) { try { await api('/api/pmo/audits/' + id, { method: 'PUT', body: JSON.stringify(readForm(form)) }); toast('已更新'); closeModal(); await renderPmo(); } catch (e) { toast(e.message, true); } }
  async function handleDeleteAudit(id) { openModal('删除确认', '<p>确认删除该送审记录？</p>', modalButtons([{ label: '取消', action: 'modal-close' }, { label: '确认删除', cls: 'danger', action: 'confirm-delete-audit', id: 'del-audit-btn' }]), ()=>{ window._delAuditId = id; }); }
  async function confirmDeleteAudit() { try { await api('/api/pmo/audits/' + window._delAuditId, { method: 'DELETE' }); toast('已删除'); closeModal(); await renderPmo(); } catch (e) { toast(e.message, true); } }

  async function handleNewChange() {
    const opts = await pmoProjectOptions();
    openModal('新增变更记录', `<form data-submit="save-change">
      <div class="form-grid">
        <div class="field"><label>项目 *</label><select class="input" name="project_id">${opts}</select></div>
        <div class="field"><label>变更类型 *</label><select class="input" name="change_type"><option>合同金额变更</option><option>成本变更</option><option>品牌变更</option><option>型号变更</option><option>方案变更</option><option>收益变化</option><option>工期变更</option></select></div>
        <div class="field"><label>变更前</label><input class="input" name="before_value"></div>
        <div class="field"><label>变更后</label><input class="input" name="after_value"></div>
        <div class="field full"><label>详细说明</label><textarea class="input" name="detail" rows="3"></textarea></div>
      </div></form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'save-change-btn' }]));
  }
  async function saveChange(form) { try { await api('/api/pmo/changes', { method: 'POST', body: JSON.stringify(readForm(form)) }); toast('已保存'); closeModal(); await renderPmo(); } catch (e) { toast(e.message, true); } }
  async function handleDeleteChange(id) { openModal('删除确认', '<p>确认删除该变更记录？</p>', modalButtons([{ label: '取消', action: 'modal-close' }, { label: '确认删除', cls: 'danger', action: 'confirm-delete-change', id: 'del-change-btn' }]), ()=>{ window._delChangeId = id; }); }
  async function confirmDeleteChange() { try { await api('/api/pmo/changes/' + window._delChangeId, { method: 'DELETE' }); toast('已删除'); closeModal(); await renderPmo(); } catch (e) { toast(e.message, true); } }

  async function handleMsDone(id, done) {
    try {
      const body = done ? { status: 'done', done_date: today() } : { status: 'pending', done_date: null };
      await api('/api/milestones/' + id, { method: 'PUT', body: JSON.stringify(body) });
      toast(done ? '里程碑已标记完成' : '里程碑已重置');
      if ((location.hash || '').includes('project-stages')) await renderProjectStages();
      else await renderPmo();
    } catch (e) { toast(e.message, true); }
  }

  async function handleQaCheck(el) {
    const project = await getCurrentProject();
    if (!project) return toast('请先选择项目', true);
    try {
      await api('/api/pmo/checks', { method: 'POST', body: JSON.stringify({ project_id: project.id, category: 'AI质检·' + (el.dataset.category || ''), item: el.dataset.item, result: el.dataset.result }) });
      toast('质检结果已记录');
    } catch (e) { toast(e.message, true); }
  }

  // ---------------- knowledge base ----------------
  async function renderKnowledge() {
    const categories = await api('/api/kb/categories');
    window._kbCategories = categories;
    appShell(`
      ${viewTitle('知识库', '项目管理规范、经验与案例沉淀，支持检索与 AI 问答', canWrite('kb') ? `<button class="btn primary" data-action="new-kb-article">${svg('plus')} 新建知识文章</button>` : '')}
      <div class="grid" style="grid-template-columns:260px 1fr">
        <div class="card card-pad">
          <div class="space-between mb16"><h3 style="margin:0;font-size:15px">知识分类</h3>
            ${canWrite('kb') ? `<button class="btn sm" data-action="new-kb-category">${svg('plus')}</button>` : ''}</div>
          <div class="tree" id="kb-tree"></div>
        </div>
        <div class="card card-pad">
          <div class="row mb16">
            <input class="input flex1" id="kb-search" placeholder="搜索标题 / 内容 / 标签…">
            <button class="btn" data-action="kb-search">搜索</button>
          </div>
          <div id="kb-list"></div>
        </div>
      </div>
      <div class="card card-pad mt16">
        <h3 style="margin:0 0 12px;font-size:15px">AI 知识库问答</h3>
        <div class="row"><input class="input flex1" id="kb-question" placeholder="输入问题，AI 将基于归档文档回答…"><button class="btn primary" data-action="kb-ask">提问</button></div>
        <div id="kb-answer" class="mt16"></div>
      </div>`);
    const tree = document.getElementById('kb-tree');
    tree.innerHTML = kbTreeHtml(categories, 0);
    await loadKbArticles('');
  }

  function kbTreeHtml(categories, depth) {
    return categories.map(c=>`
      <div>
        <div class="node ${window._kbActiveCat === c.id ? 'active' : ''}" data-action="select-kb-category" data-id="${c.id}" style="padding-left:${8+depth*14}px">
          ${svg('folder')}<span class="flex1" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</span>
          <span class="row-actions">${canWrite('kb') ? `${iconBtn('edit-kb-category:' + c.id, 'edit', '重命名')}${iconBtn('delete-kb-category:' + c.id, 'trash', '删除', 'danger')}` : ''}</span>
        </div>
        ${c.children && c.children.length ? `<div class="children">${kbTreeHtml(c.children, depth+1)}</div>` : ''}
      </div>`).join('');
  }

  async function selectKbCategory(id) {
    window._kbActiveCat = id;
    const tree = document.getElementById('kb-tree');
    if (tree) tree.querySelectorAll('.node').forEach(n=>n.classList.toggle('active', Number(n.dataset.id)===Number(id)));
    await loadKbArticles('', id);
  }

  async function loadKbArticles(q, categoryId) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (categoryId) params.set('categoryId', categoryId);
    const list = await api('/api/kb/articles?' + params.toString());
    const el = document.getElementById('kb-list');
    el.innerHTML = list.length ? list.map(a=>`
      <div class="row" style="justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
        <div class="flex1" style="min-width:0">
          <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.title)}</div>
          <div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.tags||'')} · ${esc(a.author||'')} · ${esc(a.updated_at||'')}</div>
        </div>
        <div class="row">${iconBtn('view-kb-article:' + a.id, 'doc', '查看')}${canWrite('kb') ? `${iconBtn('edit-kb-article:' + a.id, 'edit', '编辑')}${iconBtn('delete-kb-article:' + a.id, 'trash', '删除', 'danger')}` : ''}</div>
      </div>`).join('') : '<div class="empty">暂无知识文章</div>';
  }

  async function handleKbSearch() {
    const q = document.getElementById('kb-search').value.trim();
    await loadKbArticles(q, window._kbActiveCat || undefined);
  }

  async function handleNewKbCategory() {
    openModal('新建知识分类', `
      <form data-submit="save-kb-category">
        <div class="field"><label>分类名称 *</label><input class="input" name="name"></div>
        <div class="field"><label>上级分类</label><select class="input" name="parent_id"><option value="">（顶级）</option>${(window._kbCategories||[]).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
      </form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'save-kb-category-btn' }]));
  }

  async function saveKbCategory(form) {
    try {
      await api('/api/kb/categories', { method: 'POST', body: JSON.stringify(readForm(form)) });
      toast('分类已创建');
      closeModal();
      await renderKnowledge();
    } catch (e) { toast(e.message, true); }
  }

  async function handleEditKbCategory(id) {
    const cat = findKbCategory(window._kbCategories || [], id);
    if (!cat) return;
    openModal('重命名分类', `
      <form data-submit="update-kb-category" data-id="${id}"><div class="field"><label>分类名称</label><input class="input" name="name" value="${esc(cat.name)}"></div></form>`,
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'update-kb-category-btn' }]));
  }

  async function updateKbCategory(form, id) {
    try {
      await api('/api/kb/categories/' + id, { method: 'PUT', body: JSON.stringify(readForm(form)) });
      toast('分类已更新');
      closeModal();
      await renderKnowledge();
    } catch (e) { toast(e.message, true); }
  }

  async function handleDeleteKbCategory(id) {
    openModal('删除确认', '<p>确认删除该分类吗？其下文章将变为未分类。</p>',
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '确认删除', cls: 'danger', action: 'confirm-delete-kb-category', id: 'del-kb-category-btn' }]),
      () => { window._delKbCategoryId = id; });
  }

  async function confirmDeleteKbCategory() {
    try {
      await api('/api/kb/categories/' + window._delKbCategoryId, { method: 'DELETE' });
      toast('已删除');
      closeModal();
      await renderKnowledge();
    } catch (e) { toast(e.message, true); }
  }

  function findKbCategory(categories, id) {
    for (const c of categories) {
      if (Number(c.id) === Number(id)) return c;
      const found = findKbCategory(c.children || [], id);
      if (found) return found;
    }
    return null;
  }

  function kbArticleFormHtml(a) {
    const v = a || {};
    const cats = window._kbCategories || [];
    const options = cats.flatMap(c=>[`<option value="${c.id}" ${v.category_id===c.id?'selected':''}>${esc(c.name)}</option>`].concat((c.children||[]).map(x=>`<option value="${x.id}" ${v.category_id===x.id?'selected':''}>　↳ ${esc(x.name)}</option>`))).join('');
    return `
      <form data-submit="${a ? 'update-kb-article' : 'save-kb-article'}" ${a ? `data-id="${esc(a.id)}"` : ''}>
        <div class="form-grid">
          <div class="field"><label>标题 *</label><input class="input" name="title" value="${esc(v.title||'')}"></div>
          <div class="field"><label>分类</label><select class="input" name="category_id"><option value="">未分类</option>${options}</select></div>
          <div class="field full"><label>标签（逗号分隔）</label><input class="input" name="tags" value="${esc(v.tags||'')}"></div>
          <div class="field full"><label>内容</label><textarea class="input" name="content" rows="10">${esc(v.content||'')}</textarea></div>
        </div>
      </form>`;
  }

  async function handleNewKbArticle() {
    openModal('新建知识文章', kbArticleFormHtml(null),
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'save-kb-article-btn' }]));
  }

  async function saveKbArticle(form) {
    try {
      await api('/api/kb/articles', { method: 'POST', body: JSON.stringify(readForm(form)) });
      toast('文章已保存');
      closeModal();
      await renderKnowledge();
    } catch (e) { toast(e.message, true); }
  }

  async function handleViewKbArticle(id) {
    const a = await api('/api/kb/articles/' + id);
    openModal(a.title, `
      <div class="small muted mb16">${esc(a.tags||'')} · ${esc(a.author||'')} · ${esc(a.updated_at||'')}</div>
      <div style="white-space:pre-wrap;line-height:1.8">${esc(a.content||'')}</div>`, modalButtons([{ label: '关闭', action: 'modal-close' }]));
  }

  async function handleEditKbArticle(id) {
    const a = await api('/api/kb/articles/' + id);
    openModal('编辑知识文章', kbArticleFormHtml(a),
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'update-kb-article-btn' }]));
  }

  async function updateKbArticle(form, id) {
    try {
      await api('/api/kb/articles/' + id, { method: 'PUT', body: JSON.stringify(readForm(form)) });
      toast('文章已更新');
      closeModal();
      await renderKnowledge();
    } catch (e) { toast(e.message, true); }
  }

  async function handleDeleteKbArticle(id) {
    openModal('删除确认', '<p>确认删除该知识文章吗？</p>',
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '确认删除', cls: 'danger', action: 'confirm-delete-kb-article', id: 'del-kb-article-btn' }]),
      () => { window._delKbArticleId = id; });
  }

  async function confirmDeleteKbArticle() {
    try {
      await api('/api/kb/articles/' + window._delKbArticleId, { method: 'DELETE' });
      toast('已删除');
      closeModal();
      await renderKnowledge();
    } catch (e) { toast(e.message, true); }
  }

  async function handleKbAsk() {
    const q = document.getElementById('kb-question').value.trim();
    if (!q) return toast('请输入问题', true);
    const box = document.getElementById('kb-answer');
    box.innerHTML = '<div class="muted">AI 思考中…</div>';
    try {
      const res = await api('/api/ai/knowledge', { method: 'POST', body: JSON.stringify({ question: q }) });
      const d = res.data || {};
      box.innerHTML = `<div style="font-weight:600">回答</div><div class="mt8" style="white-space:pre-wrap">${esc(d.answer||'')}</div>
        ${(d.citations||[]).length?`<div class="mt8 small muted">引用文档：${d.citations.map(c=>esc(c)).join('、')}</div>`:''}`;
    } catch (e) {
      box.innerHTML = `<div class="small" style="color:var(--risk-red)">${esc(e.message)}</div>`;
    }
  }

  // ---------------- reminders ----------------
  async function renderReminders() {
    const [items, rules] = await Promise.all([api('/api/reminders'), api('/api/remind-rules')]);
    const groups = [
      { key: 'overdue', name: '已逾期', cls: 'red', list: items.filter(r=>r.level==='overdue') },
      { key: 'd3', name: '3 天内', cls: 'yellow', list: items.filter(r=>r.level==='d3' || r.level==='d1') },
      { key: 'd7', name: '7 天内', cls: 'yellow', list: items.filter(r=>r.level==='d7') }
    ];
    appShell(`
      ${viewTitle('提醒中心', '逾期 / 3 天 / 7 天三级分组 + 风险预警')}
      <div class="grid" style="grid-template-columns:1fr 1fr 1fr">
        ${groups.map(g=>`
          <div class="card card-pad">
            <h3 style="margin:0 0 12px;font-size:15px;display:flex;justify-content:space-between"><span>${esc(g.name)}</span><span class="tag ${g.cls}">${g.list.length}</span></h3>
            ${g.list.length ? g.list.map(r=>`
              <div style="padding:10px 0;border-bottom:1px solid var(--border)">
                <div style="font-weight:600">${esc(r.title)}</div>
                <div class="small muted">${esc(r.project_name || '')} · ${esc(r.due_date || '')}</div>
                ${r.amount ? `<div class="small amount">${num(r.amount)} 万</div>` : ''}
              </div>`).join('') : '<div class="empty">暂无</div>'}
          </div>`).join('')}
      </div>
      <div class="card card-pad mt16">
        <h3 style="margin:0 0 12px;font-size:15px">提醒规则</h3>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>规则</th><th>触发说明</th><th>渠道</th><th>状态</th></tr></thead>
          <tbody>${rules.map(r=>`
            <tr><td>${esc(r.name)}</td><td class="muted">${esc(r.trigger_desc || '')}</td>
            <td>${(r.channels||[]).map(c=>`<span class="tag gray">${esc(c)}</span>`).join(' ')}</td>
            <td>${canWrite('remind') ? `<label class="switch"><input type="checkbox" data-rule="${r.id}" ${r.enabled?'checked':''}><span class="slider"></span></label>` : `<span class="tag ${r.enabled?'green':'gray'}">${r.enabled?'启用':'停用'}</span>`}</td></tr>`).join('')}
          </tbody>
        </table></div>
      </div>`);
  }

  async function toggleRule(checkbox) {
    const id = checkbox.dataset.rule;
    try {
      await api('/api/remind-rules/' + id, { method: 'PUT', body: JSON.stringify({ enabled: checkbox.checked }) });
      toast('规则已更新');
    } catch (e) { toast(e.message, true); checkbox.checked = !checkbox.checked; }
  }

  // ---------------- AI config ----------------
  async function renderAiConfig() {
    const [models, caps, stats, logs] = await Promise.all([
      api('/api/ai/models'), api('/api/ai/capabilities'), api('/api/ai/stats'), api('/api/ai/logs')
    ]);
    appShell(`
      ${viewTitle('AI 配置', '3 家模型接入卡 + 5 能力独立指定模型 + 用量统计与调用日志', canWrite('ai') ? `<button class="btn primary" data-action="new-ai-model">${svg('plus')} 新增模型</button>` : '')}
      <div class="grid mb16" style="grid-template-columns:repeat(3,1fr)">
        ${models.map(m=>`
          <div class="card card-pad">
            <div class="space-between"><b>${esc(m.name)}</b>${m.is_primary?'<span class="tag primary">主用</span>':''}</div>
            <div class="small muted mt8">provider：${esc(m.provider)}</div>
            <div class="small muted">模型：${esc(m.model || '未设置')}</div>
            <div class="small muted" style="word-break:break-all">endpoint：${esc(m.endpoint || '未设置')}</div>
            <div class="row mt16">${m.enabled?'<span class="tag green">已启用</span>':'<span class="tag gray">已停用</span>'}
              ${canWrite('ai') ? `${iconBtn('edit-ai-model:' + m.id, 'edit', '编辑')}${iconBtn('delete-ai-model:' + m.id, 'trash', '删除', 'danger')}` : ''}</div>
          </div>`).join('')}
      </div>
      <div class="card card-pad mb16">
        <h3 style="margin:0 0 12px;font-size:15px">5 大能力配置</h3>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>能力</th><th>指定模型</th><th>状态</th></tr></thead>
          <tbody>${caps.map(c=>`
            <tr><td><b>${esc(c.name)}</b><div class="small muted">${esc(c.cap_key)}</div></td>
            <td>${canWrite('ai') ? `<select class="input" data-cap="${c.id}" style="width:auto;height:32px">${models.map(m=>`<option value="${m.id}" ${c.model_id===m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select>` : esc((models.find(m=>m.id===c.model_id)||{}).name || '—')}</td>
            <td>${canWrite('ai') ? `<label class="switch"><input type="checkbox" data-cap-enabled="${c.id}" ${c.enabled?'checked':''}><span class="slider"></span></label>` : `<span class="tag ${c.enabled?'green':'gray'}">${c.enabled?'启用':'停用'}</span>`}</td></tr>`).join('')}
          </tbody>
        </table></div>
      </div>
      <div class="grid" style="grid-template-columns:300px 1fr">
        <div class="card card-pad">
          <h3 style="margin:0 0 12px;font-size:15px">用量统计</h3>
          <div class="stat-card"><div class="label">总调用次数</div><div class="value">${stats.total}</div></div>
          <div class="stat-card mt16"><div class="label">成功次数</div><div class="value">${stats.success}</div></div>
          <div class="stat-card mt16"><div class="label">平均耗时</div><div class="value">${stats.avgMs}<span class="small"> ms</span></div></div>
          ${stats.byCap && stats.byCap.length ? `<div class="mt16">${stats.byCap.map(x=>`<div class="row" style="justify-content:space-between"><span>${esc(x.capability)}</span><b>${x.c}</b></div>`).join('')}</div>` : ''}
        </div>
        <div class="card card-pad">
          <h3 style="margin:0 0 12px;font-size:15px">调用日志</h3>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>时间</th><th>能力</th><th>模型</th><th class="num">耗时</th><th>状态</th></tr></thead>
            <tbody>${logs.length ? logs.map(l=>`<tr><td class="small">${esc(l.time)}</td><td>${esc(l.capability)}</td><td>${esc(l.model || '')}</td><td class="num">${l.duration_ms}ms</td><td><span class="tag ${l.status==='success'?'green':'red'}">${l.status}</span></td></tr>`).join('') : '<tr><td colspan="5" class="empty">暂无日志</td></tr>'}</tbody>
          </table></div>
        </div>
      </div>`);
  }

  async function handleNewAiModel() {
    openModal('新增模型', `
      <form data-submit="save-ai-model">
        <div class="form-grid">
          <div class="field"><label>供应商 *</label><select class="input" name="provider"><option value="deepseek">DeepSeek</option><option value="qwen">通义千问</option><option value="internal">内部私有化</option></select></div>
          <div class="field"><label>名称 *</label><input class="input" name="name"></div>
          <div class="field full"><label>Endpoint</label><input class="input" name="endpoint" placeholder="https://…/chat/completions"></div>
          <div class="field"><label>模型名</label><input class="input" name="model"></div>
          <div class="field"><label>API Key（服务端加密存储）</label><input class="input" type="password" name="apiKey"></div>
          <div class="field"><label><input type="checkbox" name="is_primary"> 设为主用模型</label></div>
          <div class="field"><label><input type="checkbox" name="enabled" checked> 启用</label></div>
        </div>
      </form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'save-ai-model-btn' }]));
  }

  async function saveAiModel(form) {
    try {
      await api('/api/ai/models', { method: 'POST', body: JSON.stringify(readForm(form)) });
      toast('模型已保存');
      closeModal();
      await renderAiConfig();
    } catch (e) { toast(e.message, true); }
  }

  async function handleEditAiModel(id) {
    const models = await api('/api/ai/models');
    const m = models.find(x=>String(x.id)===String(id));
    if (!m) return;
    openModal('编辑模型', `
      <form data-submit="update-ai-model" data-id="${id}">
        <div class="form-grid">
          <div class="field"><label>供应商</label><select class="input" name="provider">${['deepseek','qwen','internal'].map(p=>`<option value="${p}" ${m.provider===p?'selected':''}>${p}</option>`).join('')}</select></div>
          <div class="field"><label>名称</label><input class="input" name="name" value="${esc(m.name)}"></div>
          <div class="field full"><label>Endpoint</label><input class="input" name="endpoint" value="${esc(m.endpoint || '')}"></div>
          <div class="field"><label>模型名</label><input class="input" name="model" value="${esc(m.model || '')}"></div>
          <div class="field"><label>API Key（留空则不修改）</label><input class="input" type="password" name="apiKey"></div>
          <div class="field"><label><input type="checkbox" name="is_primary" ${m.is_primary?'checked':''}> 设为主用模型</label></div>
          <div class="field"><label><input type="checkbox" name="enabled" ${m.enabled?'checked':''}> 启用</label></div>
        </div>
      </form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'update-ai-model-btn' }]));
  }

  async function updateAiModel(form, id) {
    try {
      await api('/api/ai/models/' + id, { method: 'PUT', body: JSON.stringify(readForm(form)) });
      toast('模型已更新');
      closeModal();
      await renderAiConfig();
    } catch (e) { toast(e.message, true); }
  }

  async function handleDeleteAiModel(id) {
    openModal('删除确认', '<p>确认删除该模型吗？</p>',
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '确认删除', cls: 'danger', action: 'confirm-delete-ai-model', id: 'del-ai-model-btn' }]),
      () => { window._delAiModelId = id; });
  }

  async function confirmDeleteAiModel() {
    try {
      await api('/api/ai/models/' + window._delAiModelId, { method: 'DELETE' });
      toast('已删除');
      closeModal();
      await renderAiConfig();
    } catch (e) { toast(e.message, true); }
  }

  async function changeCapModel(select) {
    try {
      await api('/api/ai/capabilities/' + select.dataset.cap, { method: 'PUT', body: JSON.stringify({ model_id: Number(select.value) }) });
      toast('能力模型已更新');
    } catch (e) { toast(e.message, true); }
  }

  async function toggleCap(checkbox) {
    try {
      await api('/api/ai/capabilities/' + checkbox.dataset.capEnabled, { method: 'PUT', body: JSON.stringify({ enabled: checkbox.checked }) });
      toast('能力已更新');
    } catch (e) { toast(e.message, true); checkbox.checked = !checkbox.checked; }
  }

  // ---------------- settings ----------------
  async function renderSettings() {
    const items = await api('/api/menu/items');
    let users = [];
    if (isAdmin()) {
      try { users = await api('/api/users'); } catch (e) { users = []; }
    }
    appShell(`
      ${viewTitle('系统设置', '全局菜单自定义：主/子菜单增删改与显隐，支持导出/导入显示配置', `
        <button class="btn" data-action="export-menu">${svg('doc')} 导出菜单</button>
        <button class="btn" data-action="menu-template">${svg('doc')} 下载模板</button>
        ${canWrite('menu') ? `<button class="btn" data-action="import-menu">${svg('plus')} 导入菜单</button>` : ''}
        ${canWrite('menu') ? `<button class="btn primary" data-action="new-menu-item">${svg('plus')} 新增菜单</button>` : ''}`)}
      <input type="file" id="menu-import-file" accept="application/json,.json" style="display:none">
      <div class="card card-pad">
        <div class="table-wrap"><table class="table">
          <thead><tr><th>排序</th><th>菜单名称</th><th>显示名</th><th>链接</th><th>备注</th><th>可见</th>${canWrite('menu')?'<th></th>':''}</tr></thead>
          <tbody>${items.map(m=>`
            <tr>
              <td>${m.sort_order}</td>
              <td>${m.parent_id ? '<span style="margin-left:14px">↳ </span>' : ''}${esc(m.name)}</td>
              <td>${esc(m.display)}</td><td class="small">${esc(m.href)}</td><td class="muted">${esc(m.remark || '')}</td>
              <td><span class="tag ${m.visible?'green':'gray'}">${m.visible?'显示':'隐藏'}</span></td>
              ${canWrite('menu') ? `<td class="actions">${iconBtn('edit-menu-item:' + m.id, 'edit', '编辑')}${iconBtn('delete-menu-item:' + m.id, 'trash', '删除', 'danger')}</td>` : ''}
            </tr>`).join('')}
          </tbody>
        </table></div>
      </div>
      ${isAdmin() ? `
      <div class="card card-pad mt16">
        <div class="space-between mb16"><h3 style="margin:0;font-size:15px">用户与权限配置</h3>
          <button class="btn primary sm" data-action="new-user">${svg('plus')} 新增用户</button></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>用户名</th><th>姓名</th><th>角色</th><th>可编辑模块</th><th>创建时间</th><th></th></tr></thead>
          <tbody>${users.map(u=>`
            <tr><td>${esc(u.username)}</td><td>${esc(u.name)}</td>
              <td><span class="tag ${u.role==='admin'?'primary':'gray'}">${u.role==='admin'?'管理员':'只读'}</span></td>
              <td>${permSummary(u.permissions)}</td><td class="small muted">${esc(u.created_at || '')}</td>
              <td class="actions">${iconBtn('edit-user:' + u.id, 'edit', '编辑')}${iconBtn('delete-user:' + u.id, 'trash', '删除', 'danger')}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </div>` : ''}
      <div class="small muted mt16">修改菜单后请刷新页面，导航将按配置动态渲染（含子菜单下拉）。</div>`);
  }

  function permSummary(permissions) {
    const map = { project: '项目', fund: '资金', doc: '文档', remind: '提醒', ai: 'AI', menu: '菜单' };
    const keys = Object.keys(permissions || {}).filter((k) => permissions[k] && permissions[k].write);
    if (!keys.length) return '<span class="muted">无</span>';
    return keys.map((k) => `<span class="tag green">${esc(map[k] || k)}</span>`).join(' ');
  }

  async function handleNewMenuItem() {
    const items = await api('/api/menu/items');
    openModal('新增菜单', `
      <form data-submit="save-menu-item">
        <div class="form-grid">
          <div class="field"><label>上级菜单</label><select class="input" name="parent_id"><option value="">（顶级）</option>${items.filter(m=>!m.parent_id).map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>
          <div class="field"><label>排序</label><input class="input" type="number" name="sort_order" value="1"></div>
          <div class="field"><label>key *</label><input class="input" name="key"></div>
          <div class="field"><label>菜单名称</label><input class="input" name="name"></div>
          <div class="field"><label>显示名 *</label><input class="input" name="display"></div>
          <div class="field"><label>链接</label><input class="input" name="href" value="#/overview"></div>
          <div class="field full"><label>备注</label><input class="input" name="remark"></div>
          <div class="field"><label><input type="checkbox" name="visible" checked> 可见</label></div>
          <div class="field full"><label>可见角色</label><div class="row">
            <label><input type="checkbox" name="role_admin" checked> 管理员</label>
            <label><input type="checkbox" name="role_viewer" checked> 只读</label>
          </div></div>
        </div>
      </form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'save-menu-item-btn' }]));
  }

  async function saveMenuItem(form) {
    try {
      await api('/api/menu/items', { method: 'POST', body: JSON.stringify(readMenuForm(form)) });
      toast('菜单已保存');
      closeModal();
      await loadMenu();
      await renderSettings();
    } catch (e) { toast(e.message, true); }
  }

  async function handleEditMenuItem(id) {
    const items = await api('/api/menu/items');
    const m = items.find(x=>String(x.id)===String(id));
    if (!m) return;
    openModal('编辑菜单', `
      <form data-submit="update-menu-item" data-id="${id}">
        <div class="form-grid">
          <div class="field"><label>上级菜单</label><select class="input" name="parent_id"><option value="">（顶级）</option>${items.filter(x=>!x.parent_id && x.id!==id).map(x=>`<option value="${x.id}" ${m.parent_id===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
          <div class="field"><label>排序</label><input class="input" type="number" name="sort_order" value="${m.sort_order}"></div>
          <div class="field"><label>key</label><input class="input" name="key" value="${esc(m.key)}"></div>
          <div class="field"><label>菜单名称</label><input class="input" name="name" value="${esc(m.name)}"></div>
          <div class="field"><label>显示名</label><input class="input" name="display" value="${esc(m.display)}"></div>
          <div class="field"><label>链接</label><input class="input" name="href" value="${esc(m.href)}"></div>
          <div class="field full"><label>备注</label><input class="input" name="remark" value="${esc(m.remark || '')}"></div>
          <div class="field"><label><input type="checkbox" name="visible" ${m.visible?'checked':''}> 可见</label></div>
          <div class="field full"><label>可见角色</label><div class="row">
            <label><input type="checkbox" name="role_admin" ${(m.roles||[]).includes('admin')?'checked':''}> 管理员</label>
            <label><input type="checkbox" name="role_viewer" ${(m.roles||[]).includes('viewer')?'checked':''}> 只读</label>
          </div></div>
        </div>
      </form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'update-menu-item-btn' }]));
  }

  async function updateMenuItem(form, id) {
    try {
      await api('/api/menu/items/' + id, { method: 'PUT', body: JSON.stringify(readMenuForm(form)) });
      toast('菜单已更新');
      closeModal();
      await loadMenu();
      await renderSettings();
    } catch (e) { toast(e.message, true); }
  }

  function readMenuForm(form) {
    const data = readForm(form);
    const roles = [];
    if (data.role_admin) roles.push('admin');
    if (data.role_viewer) roles.push('viewer');
    return { ...data, roles: roles.length ? roles : ['admin'] };
  }

  async function handleDeleteMenuItem(id) {
    openModal('删除确认', '<p>确认删除该菜单项吗？子菜单将一并删除。</p>',
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '确认删除', cls: 'danger', action: 'confirm-delete-menu-item', id: 'del-menu-item-btn' }]),
      () => { window._delMenuItemId = id; });
  }

  async function confirmDeleteMenuItem() {
    try {
      await api('/api/menu/items/' + window._delMenuItemId, { method: 'DELETE' });
      toast('已删除');
      closeModal();
      await loadMenu();
      await renderSettings();
    } catch (e) { toast(e.message, true); }
  }

  function userFormHtml(u) {
    const v = u || {};
    const perms = v.permissions || {};
    const modules = [
      ['project', '项目管理'],
      ['fund', '资金台账'],
      ['contract', '合同管理'],
      ['doc', '文档管理'],
      ['remind', '提醒管理'],
      ['kb', '知识库'],
      ['template', '模板管理'],
      ['ai', 'AI 配置'],
      ['menu', '菜单/系统设置']
    ];
    return `
      <form data-submit="${u ? 'update-user' : 'save-user'}" ${u ? `data-id="${esc(u.id)}"` : ''}>
        <div class="form-grid">
          <div class="field"><label>用户名 *</label><input class="input" name="username" value="${esc(v.username || '')}" ${u ? 'disabled' : ''}></div>
          <div class="field"><label>姓名 *</label><input class="input" name="name" value="${esc(v.name || '')}"></div>
          <div class="field"><label>角色</label><select class="input" name="role">
            <option value="admin" ${v.role==='admin'?'selected':''}>管理员（PMO）</option>
            <option value="viewer" ${v.role==='viewer'?'selected':''}>只读</option>
          </select></div>
          <div class="field"><label>${u ? '重置密码（留空不修改）' : '密码 *'}</label><input class="input" type="password" name="password"></div>
          <div class="field full"><label style="font-weight:600">模块编辑权限（管理员默认全部）</label>
            <div class="grid" style="grid-template-columns:repeat(3,1fr);margin-top:8px">
              ${modules.map(([key,label])=>`
                <label class="row"><input type="checkbox" name="perm_${key}" ${perms[key] && perms[key].write ? 'checked' : ''}> ${esc(label)}</label>`).join('')}
            </div>
          </div>
        </div>
      </form>`;
  }

  function readUserForm(form) {
    const data = readForm(form);
    const permissions = {};
    ['project', 'fund', 'contract', 'doc', 'remind', 'kb', 'template', 'ai', 'menu'].forEach((key) => {
      if (data['perm_' + key]) permissions[key] = { write: true };
    });
    return { username: data.username, name: data.name, role: data.role, password: data.password || undefined, permissions };
  }

  function handleNewUser() {
    openModal('新增用户', userFormHtml(null),
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'save-user-btn' }]));
  }

  async function saveUser(form) {
    try {
      await api('/api/users', { method: 'POST', body: JSON.stringify(readUserForm(form)) });
      toast('用户已创建');
      closeModal();
      await renderSettings();
    } catch (e) { toast(e.message, true); }
  }

  async function handleEditUser(id) {
    const users = await api('/api/users');
    const u = users.find((x) => String(x.id) === String(id));
    if (!u) return toast('用户不存在', true);
    openModal('编辑用户', userFormHtml(u),
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'update-user-btn' }]));
  }

  async function updateUser(form, id) {
    try {
      await api('/api/users/' + id, { method: 'PUT', body: JSON.stringify(readUserForm(form)) });
      toast('用户已更新');
      closeModal();
      await renderSettings();
    } catch (e) { toast(e.message, true); }
  }

  async function handleDeleteUser(id) {
    openModal('删除确认', '<p>确认删除该用户吗？</p>',
      modalButtons([{ label: '取消', action: 'modal-close' }, { label: '确认删除', cls: 'danger', action: 'confirm-delete-user', id: 'del-user-btn' }]),
      () => { window._delUserId = id; });
  }

  async function confirmDeleteUser() {
    try {
      await api('/api/users/' + window._delUserId, { method: 'DELETE' });
      toast('用户已删除');
      closeModal();
      await renderSettings();
    } catch (e) { toast(e.message, true); }
  }

  async function exportMenu() {
    try {
      const data = await api('/api/menu/export');
      downloadJson('pms-menu-config.json', data);
      toast('菜单配置已导出');
    } catch (e) { toast(e.message, true); }
  }

  async function downloadMenuTemplate() {
    try {
      const data = await api('/api/menu/template');
      downloadJson('pms-menu-template.json', data);
      toast('模板已下载');
    } catch (e) { toast(e.message, true); }
  }

  function importMenu() {
    const input = document.getElementById('menu-import-file');
    if (!input) return;
    input.value = '';
    input.click();
  }

  async function handleMenuImport(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await api('/api/menu/import', { method: 'POST', body: JSON.stringify(data) });
      toast('菜单导入成功，共 ' + res.count + ' 项');
      await loadMenu();
      await renderSettings();
    } catch (e) { toast(e.message || '导入失败', true); }
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------------- action / event binding ----------------
  const ACTIONS = {
    logout() {
      api('/api/auth/logout', { method: 'POST' }).catch(() => {});
      clearSession();
      location.hash = '';
      renderLogin();
    },
    'modal-close': closeModal,
    'submit-form'(el) {
      const form = el.closest('.modal')?.querySelector('form') || document.querySelector('#' + (el.id || '').replace('-btn', '-form')) || el.closest('.modal-body')?.querySelector('form');
      if (!form) return;
      const submitAction = form.dataset.submit;
      if (submitAction) SUBMITS[submitAction] && SUBMITS[submitAction](form);
    },
    'select-project'(el) { handleSelectProject(actionArg(el)); },
    'new-project': handleNewProject,
    'project-import': handleProjectImport,
    'toggle-project-view': toggleProjectView,
    'edit-project'(el) { handleEditProject(actionArg(el)); },
    'delete-project'(el) { handleDeleteProject(actionArg(el)); },
    'detail-tab'(el) {
      window._detailTab = el.dataset.tab;
      renderProjectDetail();
    },
    'edit-project-detail'(el) { handleEditProject(actionArg(el)); },
    'new-fund'(el) { handleNewFund(el.dataset.type, el.dataset.id); },
    'edit-fund'(el) { handleEditFund(actionArg(el), el.dataset.pid); },
    'delete-fund'(el) { handleDeleteFund(actionArg(el)); },
    'new-contract'(el) { handleNewContract(el.dataset.id); },
    'edit-contract'(el) { handleEditContract(actionArg(el)); },
    'delete-contract'(el) { handleDeleteContract(actionArg(el)); },
    'new-folder'(el) { handleNewFolder(el.dataset.id); },
    'select-folder'(el) { selectFolder(actionArg(el)); },
    'edit-folder'(el) { handleEditFolder(actionArg(el)); },
    'delete-folder'(el) { handleDeleteFolder(actionArg(el)); },
    'new-docfile': handleNewDocfile,
    'edit-docfile'(el) { handleEditDocfile(actionArg(el)); },
    'delete-docfile'(el) { handleDeleteDocfile(actionArg(el)); },
    'rebuild-folders'(el) { handleRebuildFolders(actionArg(el)); },
    'ai-risk-review': handleAiRiskReview,
    'stage-upload': handleStageUpload,
    'ai-extract': handleAiExtract,
    'create-from-ai': handleCreateFromAi,
    'stage-risk-review': handleStageRiskReview,
    'ai-doc-template'(el) { handleAiDocTemplate(el.dataset.tpl); },
    'download'(el) { handleDownload(el); },
    'contract-tab'(el) { window._contractTab = el.dataset.tab; renderContracts(); },
    'new-back-contract': handleNewBackContract,
    'edit-back-contract'(el) { handleEditBackContract(actionArg(el)); },
    'delete-back-contract'(el) { handleDeleteBackContract(actionArg(el)); },
    'edit-front-contract'(el) { handleEditFrontContract(actionArg(el)); },
    'contract-files'(el) { handleContractFiles(actionArg(el)); },
    'preview-file'(el) { previewContractFile(actionArg(el)); },
    'delete-contract-file'(el) { handleDeleteContractFile(actionArg(el)); },
    'analyze-contract': handleAnalyzeContract,
    'template-tab'(el) { window._templateType = el.dataset.tab; renderTemplates(); },
    'new-template': handleNewTemplate,
    'edit-template'(el) { handleEditTemplate(actionArg(el)); },
    'delete-template'(el) { handleDeleteTemplate(actionArg(el)); },
    'select-kb-category'(el) { selectKbCategory(actionArg(el)); },
    'new-kb-category': handleNewKbCategory,
    'edit-kb-category'(el) { handleEditKbCategory(actionArg(el)); },
    'delete-kb-category'(el) { handleDeleteKbCategory(actionArg(el)); },
    'kb-search': handleKbSearch,
    'kb-ask': handleKbAsk,
    'new-kb-article': handleNewKbArticle,
    'view-kb-article'(el) { handleViewKbArticle(actionArg(el)); },
    'edit-kb-article'(el) { handleEditKbArticle(actionArg(el)); },
    'delete-kb-article'(el) { handleDeleteKbArticle(actionArg(el)); },
    'pmo-tab'(el) { window._pmoTab = el.dataset.tab; renderPmo(); },
    'pmo-table'(el) { window._pmoTableKey = el.dataset.key; renderPmo(); },
    'ms-done'(el) { handleMsDone(actionArg(el), true); },
    'ms-reset'(el) { handleMsDone(actionArg(el), false); },
    'qa-check'(el) { handleQaCheck(el); },
    'new-check': handleNewCheck,
    'edit-check'(el) { handleEditCheck(actionArg(el)); },
    'delete-check'(el) { handleDeleteCheck(actionArg(el)); },
    'new-audit': handleNewAudit,
    'edit-audit'(el) { handleEditAudit(actionArg(el)); },
    'delete-audit'(el) { handleDeleteAudit(actionArg(el)); },
    'new-change': handleNewChange,
    'delete-change'(el) { handleDeleteChange(actionArg(el)); },
    'new-ai-model': handleNewAiModel,
    'edit-ai-model'(el) { handleEditAiModel(actionArg(el)); },
    'delete-ai-model'(el) { handleDeleteAiModel(actionArg(el)); },
    'new-menu-item': handleNewMenuItem,
    'edit-menu-item'(el) { handleEditMenuItem(actionArg(el)); },
    'delete-menu-item'(el) { handleDeleteMenuItem(actionArg(el)); },
    'export-menu': exportMenu,
    'menu-template': downloadMenuTemplate,
    'import-menu': importMenu,
    'new-user': handleNewUser,
    'edit-user'(el) { handleEditUser(actionArg(el)); },
    'delete-user'(el) { handleDeleteUser(actionArg(el)); },
    'confirm-delete-project': confirmDeleteProject,
    'confirm-delete-fund': confirmDeleteFund,
    'confirm-delete-contract': confirmDeleteContract,
    'confirm-delete-folder': confirmDeleteFolder,
    'confirm-delete-docfile': confirmDeleteDocfile,
    'confirm-rebuild-folders': confirmRebuildFolders,
    'confirm-delete-back-contract': confirmDeleteBackContract,
    'confirm-delete-contract-file': confirmDeleteContractFile,
    'confirm-delete-template': confirmDeleteTemplate,
    'confirm-delete-kb-category': confirmDeleteKbCategory,
    'confirm-delete-kb-article': confirmDeleteKbArticle,
    'confirm-delete-check': confirmDeleteCheck,
    'confirm-delete-audit': confirmDeleteAudit,
    'confirm-delete-change': confirmDeleteChange,
    'confirm-delete-ai-model': confirmDeleteAiModel,
    'confirm-delete-menu-item': confirmDeleteMenuItem,
    'confirm-delete-user': confirmDeleteUser
  };

  const SUBMITS = {
    login: handleLogin,
    'save-project': (form) => saveProject(form),
    'update-project': (form) => updateProject(form, form.dataset.id),
    'save-fund': (form) => saveFund(form, form.dataset.type, form.dataset.id),
    'update-fund': (form) => updateFund(form, form.dataset.type, form.dataset.id),
    'save-contract': (form) => saveContract(form, form.dataset.id),
    'update-contract': (form) => updateContract(form, form.dataset.id),
    'save-folder': (form) => saveFolder(form, form.dataset.id),
    'update-folder': (form) => updateFolder(form, form.dataset.id),
    'save-docfile': (form) => saveDocfile(form, form.dataset.folder),
    'update-docfile': (form) => updateDocfile(form, form.dataset.id),
    'save-ai-model': saveAiModel,
    'update-ai-model': (form) => updateAiModel(form, form.dataset.id),
    'save-menu-item': saveMenuItem,
    'update-menu-item': (form) => updateMenuItem(form, form.dataset.id),
    'save-user': saveUser,
    'update-user': (form) => updateUser(form, form.dataset.id),
    'save-back-contract': saveBackContract,
    'update-back-contract': (form) => updateBackContract(form, form.dataset.id),
    'update-front-contract': (form) => updateFrontContract(form, form.dataset.id),
    'save-template': saveTemplate,
    'update-template': (form) => updateTemplate(form, form.dataset.id),
    'save-kb-category': saveKbCategory,
    'update-kb-category': (form) => updateKbCategory(form, form.dataset.id),
    'save-kb-article': saveKbArticle,
    'update-kb-article': (form) => updateKbArticle(form, form.dataset.id),
    'save-check': saveCheck,
    'update-check': (form) => updateCheck(form, form.dataset.id),
    'save-audit': saveAudit,
    'update-audit': (form) => updateAudit(form, form.dataset.id),
    'save-change': saveChange
  };

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const action = t.dataset.action;
    // 带参数的 action（如 edit-project:p001）
    const colon = action.indexOf(':');
    const base = colon > -1 ? action.slice(0, colon) : action;
    const handler = ACTIONS[base];
    if (handler) {
      e.preventDefault();
      handler(t, e);
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-submit]');
    if (!form) return;
    e.preventDefault();
    const action = form.dataset.submit;
    if (SUBMITS[action]) SUBMITS[action](form);
  });

  document.addEventListener('change', (e) => {
    if (e.target.matches('#contract-file-input') && e.target.files && e.target.files[0]) {
      return uploadContractFile(e.target);
    }
    if (e.target.matches('#pmo-ms-project')) {
      window._pmoMsProject = e.target.value;
      return renderPmo();
    }
    if (e.target.matches('#contract-project')) {
      window._contractProjectId = e.target.value;
      return renderContracts();
    }
    if (e.target.matches('#menu-import-file') && e.target.files && e.target.files[0]) {
      return handleMenuImport(e.target.files[0]);
    }
    if (e.target.matches('#project-import-file') && e.target.files && e.target.files[0]) {
      return doProjectImport(e.target.files[0]);
    }
    if (e.target.matches('input[data-rule]')) return toggleRule(e.target);
    if (e.target.matches('select[data-cap]')) return changeCapModel(e.target);
    if (e.target.matches('input[data-cap-enabled]')) return toggleCap(e.target);
  });

  window.addEventListener('hashchange', route);

  // ---------------- boot ----------------
  async function boot() {
    if (me) {
      try {
        me = await api('/api/auth/me');
        localStorage.setItem(LS_USER, JSON.stringify(me));
        await loadMenu();
      } catch (e) {
        clearSession();
      }
    }
    if (!location.hash) location.hash = '#/overview';
    await route();
  }

  boot();
})();
