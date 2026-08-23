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
      documents: 'docs',
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
    documents: renderDocuments,
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
          <div class="field"><label>项目经理</label><input class="input" name="pm" value="${val('pm', '陈志远')}"></div>
          <div class="field full"><label>备注</label><textarea class="input" name="remark">${val('remark')}</textarea></div>
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
      body.innerHTML = risksHtml(project, riskItems);
      return;
    }
    if (tab === 'changes') {
      body.innerHTML = changesHtml(project);
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

  function risksHtml(project, items) {
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

  function changesHtml(project) {
    return `<div class="card card-pad">
      <h3 style="margin:0 0 12px;font-size:15px">变更记录</h3>
      <div class="empty">项目 ${esc(project.name)} 暂无变更记录（原型预置界面）。正式环境将对接操作审计日志。</div>
    </div>`;
  }

  // ---------------- project stages ----------------
  async function renderProjectStages() {
    const project = await getCurrentProject();
    appShell(`
      ${viewTitle('三阶段流程', '启动 / 实施 / 收尾，AI 字段提取与风险审核双轨')}
      ${currentBanner(project)}
      <div class="steps">
        <div class="step active"><span class="dot">1</span>启动</div>
        <div class="step"><span class="dot">2</span>实施</div>
        <div class="step"><span class="dot">3</span>收尾</div>
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div class="card card-pad">
          <h3 style="margin:0 0 12px;font-size:15px">启动阶段 · 文档上传</h3>
          <div class="small muted mb16">上传 4 类文档：合同 / 标书 / 中标通知 / 立项材料</div>
          <input class="input" type="file" id="stage-file">
          <div class="row mt16"><button class="btn primary" data-action="stage-upload">上传文档</button></div>
          <div id="stage-files" class="mt16"></div>
        </div>
        <div class="card card-pad">
          <h3 style="margin:0 0 12px;font-size:15px">AI 字段抽取</h3>
          <textarea class="input" id="extract-text" rows="6" placeholder="粘贴合同/标书文本，AI 将抽取 12 字段 JSON…"></textarea>
          <div class="row mt16"><button class="btn primary" data-action="ai-extract">AI 抽取字段</button></div>
          <div id="extract-result" class="mt16"></div>
        </div>
      </div>
      <div class="card card-pad mt16">
        <h3 style="margin:0 0 12px;font-size:15px">风险审核双轨</h3>
        <p class="small muted">AI 预审 + 人工复核，金额入账必须人工确认。</p>
        <textarea class="input" id="stage-risk-text" rows="4" placeholder="粘贴合同文本进行风险审核…"></textarea>
        <div class="row mt16"><button class="btn" data-action="stage-risk-review">AI 风险审核</button></div>
        <div id="stage-risk-result" class="mt16"></div>
      </div>
      <div class="card card-pad mt16">
        <h3 style="margin:0 0 8px;font-size:15px">实施 / 收尾阶段</h3>
        <div class="small muted">实施与收尾流程在原型中为锁定预览；正式环境将按项目阶段解锁对应文档与归档清单。</div>
        <div class="row mt16"><span class="tag gray">实施 · 锁定预览</span><span class="tag gray">收尾 · 生成归档清单 PDF + 已归档标记</span></div>
      </div>`);
    loadStageFiles(project);
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
      ${viewTitle('文档中心', '可编辑文件夹树 + 文档表格行内增删改 + AI 模板')}
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
        </div>
      </form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'save-menu-item-btn' }]));
  }

  async function saveMenuItem(form) {
    try {
      await api('/api/menu/items', { method: 'POST', body: JSON.stringify(readForm(form)) });
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
        </div>
      </form>`, modalButtons([{ label: '取消', action: 'modal-close' }, { label: '保存', cls: 'primary', action: 'submit-form', id: 'update-menu-item-btn' }]));
  }

  async function updateMenuItem(form, id) {
    try {
      await api('/api/menu/items/' + id, { method: 'PUT', body: JSON.stringify(readForm(form)) });
      toast('菜单已更新');
      closeModal();
      await loadMenu();
      await renderSettings();
    } catch (e) { toast(e.message, true); }
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
      ['doc', '文档管理'],
      ['remind', '提醒管理'],
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
    ['project', 'fund', 'doc', 'remind', 'ai', 'menu'].forEach((key) => {
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
    'ai-risk-review': handleAiRiskReview,
    'stage-upload': handleStageUpload,
    'ai-extract': handleAiExtract,
    'create-from-ai': handleCreateFromAi,
    'stage-risk-review': handleStageRiskReview,
    'ai-doc-template'(el) { handleAiDocTemplate(el.dataset.tpl); },
    'download'(el) { handleDownload(el); },
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
    'delete-user'(el) { handleDeleteUser(actionArg(el)); }
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
    'update-user': (form) => updateUser(form, form.dataset.id)
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
    if (e.target.matches('#menu-import-file') && e.target.files && e.target.files[0]) {
      return handleMenuImport(e.target.files[0]);
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
