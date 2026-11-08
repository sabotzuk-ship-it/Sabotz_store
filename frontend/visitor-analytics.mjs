import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import nodemailer from 'nodemailer';

const day = 24 * 60 * 60 * 1000;
const retention = 90 * day;
const storePage = /^\/(?:|collection|shoes|clothing|accessories|(?:categories|products)\/[a-z0-9]+(?:-[a-z0-9]+)*)$/;
const welcomeText = 'Welcome to SABOTZ.\n\nThanks for stopping by. Explore our selection of sneakers, clothing and accessories. For details or availability, find us on Instagram at @sabotz.clothing.\n\nSABOTZ Clothing & Supply\n\nIf you did not enter your email on our website, you can ignore this message.';
const welcomeHtml = `<div style="background:#111;color:#fff;padding:32px;font-family:Arial,sans-serif">
  <p style="font-weight:bold;letter-spacing:2px">SABOTZ.</p>
  <h1>Welcome to SABOTZ.</h1>
  <p>Thanks for stopping by. Explore our selection of sneakers, clothing and accessories.</p>
  <p>For details or availability, find us on <a href="https://www.instagram.com/sabotz.clothing/" style="color:#fff">Instagram</a>.</p>
  <p>SABOTZ Clothing &amp; Supply</p>
  <p style="color:#bbb;font-size:12px">If you did not enter your email on our website, you can ignore this message.</p>
</div>`;

export function registerVisitorAnalytics(app, { databasePath, requireAdmin }) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS visitor_entries (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, entered_at INTEGER NOT NULL, tracking INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS page_visits (
      visitor_id TEXT NOT NULL REFERENCES visitor_entries(id) ON DELETE CASCADE,
      view_id TEXT NOT NULL, path TEXT NOT NULL, opened_at INTEGER NOT NULL, seconds INTEGER NOT NULL,
      PRIMARY KEY (visitor_id, view_id)
    );
    CREATE INDEX IF NOT EXISTS visitor_entries_date ON visitor_entries(entered_at);
    CREATE TABLE IF NOT EXISTS welcome_delivery (
      email_hash TEXT PRIMARY KEY, attempted_at INTEGER NOT NULL, sent INTEGER NOT NULL DEFAULT 0
    );
  `);

  const visitorById = db.prepare('SELECT * FROM visitor_entries WHERE id = ? AND entered_at >= ?');
  const visitors = req => visitorById.get(req.session.visitorId ?? '', Date.now() - retention);
  const sender = process.env.WELCOME_GMAIL_USER?.trim();
  const appPassword = process.env.WELCOME_GMAIL_APP_PASSWORD?.replace(/\s/g, '');
  const mailer = sender && /^[a-z0-9]{16}$/i.test(appPassword ?? '') ? nodemailer.createTransport({
    service: 'gmail', auth: { user: sender, pass: appPassword },
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10_000
  }) : null;
  const welcomeEnabled = Boolean(mailer);
  const entryAttempts = new Map();

  function purgeExpired() {
    const cutoff = Date.now() - retention;
    db.prepare('DELETE FROM visitor_entries WHERE entered_at < ?').run(cutoff);
    db.prepare('DELETE FROM welcome_delivery WHERE attempted_at < ?').run(cutoff);
  }

  purgeExpired();
  setInterval(purgeExpired, day).unref();
  setInterval(() => entryAttempts.clear(), 60_000).unref();

  async function sendWelcome(email) {
    if (!mailer) return;
    const now = Date.now();
    const { count } = db.prepare('SELECT count(*) AS count FROM welcome_delivery WHERE attempted_at >= ?').get(now - day);
    if (count >= 90) return;
    const key = createHash('sha256').update(email).digest('hex');
    const claim = db.prepare(`
      INSERT INTO welcome_delivery (email_hash, attempted_at) VALUES (?, ?)
      ON CONFLICT(email_hash) DO UPDATE SET attempted_at = excluded.attempted_at
      WHERE welcome_delivery.sent = 0 AND welcome_delivery.attempted_at < ?
    `).run(key, now, now - day);
    if (!claim.changes) return;
    try {
      await mailer.sendMail({
        from: { name: 'SABOTZ Clothing & Supply', address: sender },
        to: [{ address: email }], subject: 'Welcome to SABOTZ',
        text: welcomeText, html: welcomeHtml
      });
      db.prepare('UPDATE welcome_delivery SET sent = 1 WHERE email_hash = ?').run(key);
    } catch (error) {
      console.error('SABOTZ welcome email failed:', error.code || 'mail error');
    }
  }

  app.use('/api/visitors', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method === 'POST' && req.get('X-Requested-With') !== 'XMLHttpRequest') {
      return res.status(403).json({ error: 'The request could not be verified.' });
    }
    next();
  });

  app.get('/api/visitors/session', (req, res) => {
    if (req.session.adminUsername) return res.json({ entered: true, tracking: false, welcomeEnabled });
    const visitor = visitors(req);
    res.json({ entered: Boolean(visitor?.email), tracking: Boolean(visitor?.tracking), welcomeEnabled });
  });

  app.post('/api/visitors/entry', (req, res, next) => {
    if (req.session.adminUsername) return res.json({ entered: true, tracking: false, welcomeEnabled });
    const visitor = visitors(req);
    const guestConsent = req.body?.email === null && req.body.tracking === true;
    if (visitor && guestConsent) {
      db.prepare('UPDATE visitor_entries SET tracking = 1 WHERE id = ?').run(visitor.id);
      return res.json({ entered: Boolean(visitor.email), tracking: true, welcomeEnabled });
    }
    if (visitor?.email) return res.json({ entered: true, tracking: Boolean(visitor.tracking), welcomeEnabled });
    const attempts = entryAttempts.get(req.ip) ?? 0;
    if (attempts >= 8) return res.status(429).json({ error: 'Please wait a minute and try again.' });
    entryAttempts.set(req.ip, attempts + 1);

    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!guestConsent && (email.length > 254 || !/^[^\s@,;<>]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(email))) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    const id = randomUUID();
    const tracking = req.body.tracking === true;
    db.prepare('INSERT INTO visitor_entries VALUES (?, ?, ?, ?)').run(id, email, Date.now(), Number(tracking));
    req.session.visitorId = id;
    req.session.save(error => {
      if (error) {
        db.prepare('DELETE FROM visitor_entries WHERE id = ?').run(id);
        return next(error);
      }
      res.status(201).json({ entered: Boolean(email), tracking, welcomeEnabled });
      if (email) void sendWelcome(email).catch(() => console.error('SABOTZ welcome email could not be queued.'));
    });
  });

  app.post('/api/visitors/stop-tracking', (req, res, next) => {
    const visitor = visitors(req);
    if (visitor && !visitor.email && !req.session.adminUsername) {
      db.prepare('DELETE FROM visitor_entries WHERE id = ?').run(visitor.id);
      return req.session.destroy(error => {
        if (error) return next(error);
        res.clearCookie('sabotz.sid');
        res.sendStatus(204);
      });
    }
    if (visitor) {
      db.prepare('UPDATE visitor_entries SET tracking = 0 WHERE id = ?').run(visitor.id);
      db.prepare('DELETE FROM page_visits WHERE visitor_id = ?').run(visitor.id);
    }
    res.sendStatus(204);
  });

  const recordView = db.prepare(`
    INSERT INTO page_visits (visitor_id, view_id, path, opened_at, seconds)
    SELECT ?, ?, ?, ?, ? WHERE
      EXISTS (SELECT 1 FROM page_visits WHERE visitor_id = ? AND view_id = ?)
      OR (SELECT count(*) FROM page_visits WHERE visitor_id = ?) < 200
    ON CONFLICT(visitor_id, view_id) DO UPDATE SET seconds = max(page_visits.seconds, excluded.seconds)
    WHERE page_visits.path = excluded.path
  `);

  app.post('/api/visitors/view', (req, res) => {
    const visitor = visitors(req);
    if (req.session.adminUsername || !visitor?.tracking) return res.sendStatus(204);
    const { viewId, path, seconds } = req.body ?? {};
    if (typeof viewId !== 'string' || !/^[a-f0-9]{32}$/.test(viewId) ||
        typeof path !== 'string' || path.length > 200 || !storePage.test(path) ||
        !Number.isInteger(seconds) || seconds < 0 || seconds > 1800) return res.sendStatus(400);
    recordView.run(visitor.id, viewId, path, Date.now(), seconds, visitor.id, viewId, visitor.id);
    res.sendStatus(204);
  });

  app.get('/api/admin/visitors', requireAdmin, (_req, res) => {
    purgeExpired();
    res.set('Cache-Control', 'no-store');
    const totals = db.prepare(`SELECT count(*) AS entries, count(DISTINCT nullif(email, '')) AS emails,
      coalesce(sum(tracking), 0) AS tracked FROM visitor_entries`).get();
    const summarize = db.prepare(`SELECT path, count(*) AS views, round(avg(seconds)) AS averageSeconds
      FROM page_visits WHERE path LIKE ? GROUP BY path ORDER BY views DESC, path LIMIT 30`);
    const pages = summarize.all('%');
    const products = summarize.all('/products/%');
    const productsByTime = db.prepare(`SELECT path, count(*) AS views, round(avg(seconds)) AS averageSeconds
      FROM page_visits WHERE path LIKE '/products/%' GROUP BY path
      ORDER BY averageSeconds DESC, views DESC, path LIMIT 30`).all();
    const journey = db.prepare(`SELECT path, opened_at AS openedAt, seconds FROM page_visits
      WHERE visitor_id = ? AND path LIKE '/products/%' ORDER BY opened_at DESC, rowid DESC LIMIT 30`);
    const recent = db.prepare(`SELECT id, email, entered_at AS enteredAt, tracking FROM visitor_entries
      ORDER BY entered_at DESC LIMIT 30`).all().map(entry => ({
      ...entry, tracking: Boolean(entry.tracking), journey: journey.all(entry.id).reverse()
    }));
    res.json({ totals, pages, products, productsByTime, recent });
  });
}
