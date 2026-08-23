const crypto = require('node:crypto');
const { db, verifyPassword } = require('./db');

const SESSION_HOURS = 2;

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_HOURS * 3600 * 1000);
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(fmt(now));
  db.prepare('INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)')
    .run(token, user.id, fmt(now), fmt(expires));
  return { token, user: publicUser(user), expiresAt: expires.toISOString() };
}

function login(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return null;
  }
  return createSession(user);
}

function getSessionUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const session = db.prepare(`SELECT s.*, u.username, u.name, u.role, u.permissions
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`).get(token);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return { id: session.user_id, username: session.username, name: session.name, role: session.role, permissions: session.permissions || '{}' };
}

function publicUser(user) {
  return { id: user.id, username: user.username, name: user.name, role: user.role, permissions: user.permissions || '{}' };
}

function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: '未登录或会话已过期，请重新登录' });
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: '未登录或会话已过期，请重新登录' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '当前为只读角色，无权限执行该操作' });
  }
  next();
}

function userCanWrite(user, module) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  let perms = {};
  try { perms = JSON.parse(user.permissions || '{}'); } catch (e) { perms = {}; }
  const p = perms['*'] || perms[module];
  return !!(p && p.write);
}

function requireWrite(module) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '未登录或会话已过期，请重新登录' });
    if (!userCanWrite(req.user, module)) {
      return res.status(403).json({ error: '当前用户没有该模块的编辑权限' });
    }
    next();
  };
}

function logout(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function fmt(d) {
  // SQLite datetime('now','localtime') yields "YYYY-MM-DD HH:MM:SS"
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

module.exports = { login, getSessionUser, requireAuth, requireAdmin, requireWrite, userCanWrite, logout, fmt };
