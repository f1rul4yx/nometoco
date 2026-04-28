const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const webPush = require('web-push');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'nometoco_' + require('crypto').randomBytes(32).toString('hex');
const DB_PATH = path.join(__dirname, '..', 'data', 'nometoco.db');
const VAPID_PATH = path.join(__dirname, '..', 'data', 'vapid-keys.json');
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@nometoco.local';
const TZ = process.env.TZ || 'Europe/Madrid';

if (!fs.existsSync(DB_PATH)) { console.log('⚠️  Ejecuta: npm run setup'); process.exit(1); }

let vapidKeys;
if (fs.existsSync(VAPID_PATH)) {
  vapidKeys = JSON.parse(fs.readFileSync(VAPID_PATH, 'utf8'));
} else {
  vapidKeys = webPush.generateVAPIDKeys();
  fs.mkdirSync(path.dirname(VAPID_PATH), { recursive: true });
  fs.writeFileSync(VAPID_PATH, JSON.stringify(vapidKeys, null, 2));
}
webPush.setVapidDetails(VAPID_EMAIL, vapidKeys.publicKey, vapidKeys.privateKey);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE, keys_p256dh TEXT NOT NULL, keys_auth TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id)
);`);

function nowInTZ() { return new Date(new Date().toLocaleString('en-US', { timeZone: TZ })); }
function dateStr(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

function cookieOpts(req) {
  const secure = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https';
  return { httpOnly: true, maxAge: 90*24*60*60*1000, sameSite: 'lax', secure };
}

function auth(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    const p = jwt.verify(token, JWT_SECRET);
    req.userId = p.userId; req.username = p.username; next();
  } catch { res.clearCookie('token'); return res.status(401).json({ error: 'Token inválido' }); }
}

// ── AUTH ──
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Faltan campos' });
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Credenciales incorrectas' });
  res.cookie('token', jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '90d' }), cookieOpts(req));
  res.json({ ok: true, username: user.username });
});

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Faltan campos' });
  if (password.length < 4) return res.status(400).json({ error: 'Contraseña mínimo 4 caracteres' });
  if (username.length < 2) return res.status(400).json({ error: 'Usuario mínimo 2 caracteres' });
  if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) return res.status(409).json({ error: 'Usuario ya existe' });
  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare('INSERT INTO users (username,password_hash) VALUES (?,?)').run(username, hash);
  res.cookie('token', jwt.sign({ userId: r.lastInsertRowid, username }, JWT_SECRET, { expiresIn: '90d' }), cookieOpts(req));
  res.json({ ok: true, username });
});

app.post('/api/logout', (req, res) => { res.clearCookie('token'); res.json({ ok: true }); });
app.get('/api/me', auth, (req, res) => { res.json({ username: req.username }); });

app.post('/api/change-password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Faltan campos' });
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(newPassword, 10), req.userId);
  res.json({ ok: true });
});

// ── PUSH ──
app.get('/api/push/vapid-key', (req, res) => { res.json({ publicKey: vapidKeys.publicKey }); });

app.post('/api/push/subscribe', auth, (req, res) => {
  const { subscription } = req.body;
  if (!subscription?.endpoint || !subscription?.keys) return res.status(400).json({ error: 'Subscription inválida' });
  db.prepare(`INSERT INTO push_subscriptions (user_id,endpoint,keys_p256dh,keys_auth) VALUES (?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,keys_p256dh=excluded.keys_p256dh,keys_auth=excluded.keys_auth
  `).run(req.userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth);
  res.json({ ok: true });
});

// ── DATA ──
app.post('/api/checkin', auth, (req, res) => {
  const { habit, date, hour, touched } = req.body;
  if (!['face','nails'].includes(habit) || typeof touched !== 'boolean') return res.status(400).json({ error: 'Datos inválidos' });
  db.prepare(`INSERT INTO hour_logs (user_id,habit,date,hour,touched) VALUES (?,?,?,?,?)
    ON CONFLICT(user_id,habit,date,hour) DO UPDATE SET touched=excluded.touched`).run(req.userId, habit, date, hour, touched ? 1 : 0);
  if (touched) {
    db.prepare(`INSERT INTO day_results (user_id,habit,date,result) VALUES (?,?,?,'fail')
      ON CONFLICT(user_id,habit,date) DO UPDATE SET result='fail'`).run(req.userId, habit, date);
  } else {
    // If correcting from touched to not-touched, recalculate day
    recalcDay(req.userId, habit, date);
  }
  res.json({ ok: true });
});

// Push checkin — identifies user by endpoint
app.post('/api/push-checkin', (req, res) => {
  const { endpoint, date, hour, touched } = req.body;
  console.log(`📥 Push-checkin: endpoint=${endpoint?.substring(0,40)}... date=${date} hour=${hour} touched=${touched}`);
  if (!endpoint) return res.status(400).json({ error: 'Falta endpoint' });
  const sub = db.prepare('SELECT user_id FROM push_subscriptions WHERE endpoint=?').get(endpoint);
  if (!sub) { console.log('❌ Endpoint no encontrado'); return res.status(404).json({ error: 'Subscription no encontrada' }); }
  const userId = sub.user_id;
  console.log(`✅ User ${userId}, touched=${touched}`);

  for (const habit of ['face','nails']) {
    db.prepare(`INSERT INTO hour_logs (user_id,habit,date,hour,touched) VALUES (?,?,?,?,?)
      ON CONFLICT(user_id,habit,date,hour) DO UPDATE SET touched=excluded.touched`).run(userId, habit, date, hour, touched ? 1 : 0);
    if (touched) {
      db.prepare(`INSERT INTO day_results (user_id,habit,date,result) VALUES (?,?,?,'fail')
        ON CONFLICT(user_id,habit,date) DO UPDATE SET result='fail'`).run(userId, habit, date);
    } else {
      recalcDay(userId, habit, date);
    }
  }
  res.json({ ok: true });
});

// Recalculate day result: only fail if any hour is touched=true
function recalcDay(userId, habit, date) {
  const logs = db.prepare('SELECT touched FROM hour_logs WHERE user_id=? AND habit=? AND date=?').all(userId, habit, date);
  if (logs.length === 0) {
    db.prepare('DELETE FROM day_results WHERE user_id=? AND habit=? AND date=?').run(userId, habit, date);
    return;
  }
  const anyFail = logs.some(l => l.touched);
  if (anyFail) {
    db.prepare(`INSERT INTO day_results (user_id,habit,date,result) VALUES (?,?,?,'fail')
      ON CONFLICT(user_id,habit,date) DO UPDATE SET result='fail'`).run(userId, habit, date);
  } else {
    // All clean — remove fail if it was there
    db.prepare('DELETE FROM day_results WHERE user_id=? AND habit=? AND date=?').run(userId, habit, date);
  }
}

app.post('/api/finalize-day', auth, (req, res) => {
  const { habit, date } = req.body;
  if (!['face','nails'].includes(habit)) return res.status(400).json({ error: 'Hábito inválido' });
  const existing = db.prepare('SELECT result FROM day_results WHERE user_id=? AND habit=? AND date=?').get(req.userId, habit, date);
  if (existing) return res.json({ ok: true, result: existing.result });
  const logs = db.prepare('SELECT touched FROM hour_logs WHERE user_id=? AND habit=? AND date=?').all(req.userId, habit, date);
  if (logs.length === 0) return res.json({ ok: true, result: null });
  const result = logs.some(l => l.touched) ? 'fail' : 'success';
  db.prepare(`INSERT INTO day_results (user_id,habit,date,result) VALUES (?,?,?,?)
    ON CONFLICT(user_id,habit,date) DO UPDATE SET result=excluded.result`).run(req.userId, habit, date, result);
  res.json({ ok: true, result });
});

app.get('/api/data/:habit', auth, (req, res) => {
  const { habit } = req.params;
  if (!['face','nails'].includes(habit)) return res.status(400).json({ error: 'Hábito inválido' });
  const hours = {};
  db.prepare('SELECT date,hour,touched FROM hour_logs WHERE user_id=? AND habit=?').all(req.userId, habit)
    .forEach(l => { hours[`${l.date}_${l.hour}`] = !!l.touched; });
  const days = {};
  db.prepare('SELECT date,result FROM day_results WHERE user_id=? AND habit=?').all(req.userId, habit)
    .forEach(d => { days[d.date] = d.result; });
  res.json({ hours, days });
});

app.delete('/api/data/:habit', auth, (req, res) => {
  const { habit } = req.params;
  if (!['face','nails'].includes(habit)) return res.status(400).json({ error: 'Hábito inválido' });
  db.prepare('DELETE FROM hour_logs WHERE user_id=? AND habit=?').run(req.userId, habit);
  db.prepare('DELETE FROM day_results WHERE user_id=? AND habit=?').run(req.userId, habit);
  res.json({ ok: true });
});

app.get('/api/time', (req, res) => {
  const now = nowInTZ();
  res.json({ hour: now.getHours(), minute: now.getMinutes(), date: dateStr(now) });
});

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, '..', 'public', 'index.html')); });

// ── PUSH CRON ──
let lastSentHour = -1;
function checkAndSendPush() {
  const now = nowInTZ();
  const h = now.getHours();
  const today = dateStr(now);
  if (h < 8 && h !== 0) return;
  if (h === lastSentHour) return;
  lastSentHour = h;

  const subs = db.prepare('SELECT * FROM push_subscriptions').all();
  if (!subs.length) return;

  const notifDate = h === 0 ? dateStr(new Date(now.getTime() - 86400000)) : today;
  const notifHour = h === 0 ? 0 : h;
  const body = h === 0 ? '🌙 Último check. ¿Te has tocado desde las 23:00?' : `Son las ${h}:00. ¿Te has tocado la cara o mordido las uñas?`;

  console.log(`📤 ${subs.length} push (${h}:00, date=${notifDate})`);

  for (const sub of subs) {
    webPush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
      JSON.stringify({
        title: 'No Me Toco 🔔', body, icon: '/icon-192.png', badge: '/icon-192.png',
        tag: `checkin-${notifDate}-${notifHour}`, renotify: true, requireInteraction: true,
        vibrate: [200, 100, 200]
      })
    ).catch(err => {
      console.error(`❌ Push user ${sub.user_id}:`, err.statusCode || err.message);
      if (err.statusCode === 410 || err.statusCode === 404) {
        db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(sub.endpoint);
      }
    });
  }
}
setInterval(checkAndSendPush, 15000);

// Auto-finalize yesterday at 1 AM
setInterval(() => {
  const now = nowInTZ();
  if (now.getHours() !== 1 || now.getMinutes() > 0) return;
  const yKey = dateStr(new Date(now.getTime() - 86400000));
  for (const user of db.prepare('SELECT id FROM users').all()) {
    for (const habit of ['face','nails']) {
      if (db.prepare('SELECT 1 FROM day_results WHERE user_id=? AND habit=? AND date=?').get(user.id, habit, yKey)) continue;
      const logs = db.prepare('SELECT touched FROM hour_logs WHERE user_id=? AND habit=? AND date=?').all(user.id, habit, yKey);
      if (!logs.length) continue;
      const result = logs.some(l => l.touched) ? 'fail' : 'success';
      db.prepare(`INSERT INTO day_results (user_id,habit,date,result) VALUES (?,?,?,?)
        ON CONFLICT(user_id,habit,date) DO UPDATE SET result=excluded.result`).run(user.id, habit, yKey, result);
      console.log(`📅 Finalized ${yKey} ${habit} user ${user.id}: ${result}`);
    }
  }
}, 60000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 No Me Toco en http://0.0.0.0:${PORT}`);
  console.log(`🕐 TZ: ${TZ} | 📬 Push: 8:00-00:00`);
});
