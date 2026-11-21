/* AEON Homes backend: Express + JSON file database (no paid services needed) */
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const IMG_DIR = path.join(__dirname, 'public', 'images');
const UPLOAD_DIR = path.join(IMG_DIR, 'uploads');
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@aeonhomes.ph';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ---------- tiny JSON database ---------- */
const seedProps = () => {
  const P = (id, title, type, price, city, beds, baths, sqm, img, featured) => ({
    id, title, type, price, city, beds, baths, sqm, image: img, featured: !!featured,
    description: 'A beautifully designed home with refined finishes, generous natural light and premium amenities.',
    createdAt: new Date().toISOString()
  });
  return [
    P(1, 'Skyline Infinity Villa', 'sale', 85000000, 'Davao City', 5, 6, 640, 'house-3.jpg', true),
    P(2, 'Urban Twin Residences', 'sale', 32500000, 'Cebu City', 4, 4, 310, 'house-4.jpg'),
    P(3, 'Glass Pavilion House', 'sale', 58000000, 'Tagaytay', 4, 5, 420, 'house-5.jpg', true),
    P(4, 'Modern White Cube', 'sale', 27800000, 'Quezon City', 3, 3, 260, 'house-19.jpg'),
    P(5, 'Cliffside Lake Retreat', 'sale', 96000000, 'Batangas', 4, 5, 520, 'house-6.jpg', true),
    P(6, 'Midnight Pool Residence', 'sale', 64500000, 'Makati', 5, 5, 480, 'house-20.jpg'),
    P(7, 'Twilight Garden Estate', 'rent', 180000, 'Taguig', 4, 4, 350, 'house-7.jpg'),
    P(8, 'Tropical Canopy House', 'rent', 150000, 'Davao City', 3, 3, 300, 'house-8.jpg', true),
    P(9, 'Solar Terrace Home', 'rent', 120000, 'Cebu City', 3, 3, 280, 'house-9.jpg'),
    P(10, 'Courtyard Modern Villa', 'rent', 135000, 'Alabang', 4, 4, 330, 'house-10.jpg'),
    P(11, 'Concrete Garden House', 'rent', 95000, 'Antipolo', 3, 2, 240, 'house-12.jpg'),
    P(12, 'Forest Gate Residence', 'rent', 110000, 'Tagaytay', 3, 3, 270, 'house-13.jpg'),
    P(13, 'Aurora Bay Home', 'sale', 41000000, 'Subic', 3, 3, 290, 'house-14.jpg'),
    P(14, 'Palmview Colonial Estate', 'sale', 52000000, 'Davao City', 5, 4, 450, 'house-15.jpg'),
    P(15, 'Harbor Lights Cottage', 'rent', 85000, 'Samal Island', 3, 2, 220, 'house-16.jpg'),
    P(16, 'Cliff Haven Lodge', 'sale', 38500000, 'Baguio', 4, 3, 340, 'house-17.jpg'),
    P(17, 'Fjordside Heritage Home', 'rent', 98000, 'Baguio', 3, 2, 260, 'house-18.jpg'),
    P(18, 'Horizon Glass Residence', 'sale', 72000000, 'Alabang', 4, 4, 410, 'house-21.jpg', true)
  ];
};

function loadDb() {
  if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  const db = {
    users: [{
      id: 1, name: 'Administrator', email: ADMIN_EMAIL.toLowerCase(),
      hash: bcrypt.hashSync(ADMIN_PASSWORD, 10), role: 'admin',
      favorites: [], createdAt: new Date().toISOString()
    }],
    properties: seedProps(),
    inquiries: [],
    visits: [],
    counters: { user: 2, property: 19, inquiry: 1 }
  };
  saveDb(db);
  return db;
}
function saveDb(d) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
const db = loadDb();
const save = () => saveDb(db);

/* ---------- app + auth helpers ---------- */
const app = express();
app.use(express.json({ limit: '1mb' }));

const sign = (u) => jwt.sign({ id: u.id, role: u.role }, JWT_SECRET, { expiresIn: '7d' });
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, favorites: u.favorites, createdAt: u.createdAt });

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  try {
    const p = jwt.verify(h.replace('Bearer ', ''), JWT_SECRET);
    const u = db.users.find((x) => x.id === p.id);
    if (!u) throw new Error('no user');
    req.user = u;
    next();
  } catch {
    res.status(401).json({ error: 'Please log in.' });
  }
}
const admin = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only.' });

/* ---------- auth ---------- */
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ error: 'Name, email and a 6+ character password are required.' });
  if (db.users.some((u) => u.email === email.toLowerCase()))
    return res.status(409).json({ error: 'Email already registered.' });
  const u = {
    id: db.counters.user++, name: name.trim(), email: email.toLowerCase(),
    hash: bcrypt.hashSync(password, 10), role: 'user', favorites: [], createdAt: new Date().toISOString()
  };
  db.users.push(u); save();
  res.json({ token: sign(u), user: publicUser(u) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = db.users.find((x) => x.email === String(email || '').toLowerCase());
  if (!u || !bcrypt.compareSync(password || '', u.hash))
    return res.status(401).json({ error: 'Invalid email or password.' });
  res.json({ token: sign(u), user: publicUser(u) });
});

app.get('/api/me', auth, (req, res) => res.json(publicUser(req.user)));

app.put('/api/me', auth, (req, res) => {
  const { name, password } = req.body || {};
  if (name) req.user.name = String(name).trim();
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Password must be 6+ characters.' });
    req.user.hash = bcrypt.hashSync(password, 10);
  }
  save();
  res.json(publicUser(req.user));
});

/* ---------- public properties ---------- */
app.get('/api/properties', (req, res) => {
  const { type, q, min, max, city } = req.query;
  let list = db.properties.slice();
  if (type) list = list.filter((p) => p.type === type);
  if (city) list = list.filter((p) => p.city.toLowerCase() === String(city).toLowerCase());
  if (q) list = list.filter((p) => (p.title + p.city).toLowerCase().includes(String(q).toLowerCase()));
  if (min) list = list.filter((p) => p.price >= Number(min));
  if (max) list = list.filter((p) => p.price <= Number(max));
  res.json(list);
});
app.get('/api/properties/:id', (req, res) => {
  const p = db.properties.find((x) => x.id === Number(req.params.id));
  p ? res.json(p) : res.status(404).json({ error: 'Not found' });
});

/* ---------- visit tracking (privacy-friendly: hashed IP) ---------- */
app.post('/api/track', (req, res) => {
  const { path: pg, propertyId } = req.body || {};
  const ip = crypto.createHash('sha256').update(String(req.ip) + new Date().toDateString()).digest('hex').slice(0, 12);
  db.visits.push({ t: Date.now(), path: String(pg || '/').slice(0, 100), propertyId: propertyId || null, v: ip });
  if (db.visits.length > 50000) db.visits.splice(0, db.visits.length - 50000);
  save();
  res.json({ ok: true });
});

/* ---------- inquiries (book now, sell requests, contact) ---------- */
app.post('/api/inquiries', (req, res) => {
  const { kind, name, email, phone, message, propertyId, details } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });
  let userId = null;
  try {
    const p = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), JWT_SECRET);
    userId = p.id;
  } catch {}
  const item = {
    id: db.counters.inquiry++, kind: kind || 'booking', name, email, phone: phone || '',
    message: message || '', propertyId: propertyId || null, details: details || null,
    userId, status: 'new', createdAt: new Date().toISOString()
  };
  db.inquiries.push(item); save();
  res.json({ ok: true, inquiry: item });
});

app.get('/api/me/inquiries', auth, (req, res) =>
  res.json(db.inquiries.filter((i) => i.userId === req.user.id || i.email === req.user.email).reverse()));

app.get('/api/me/favorites', auth, (req, res) =>
  res.json(db.properties.filter((p) => req.user.favorites.includes(p.id))));

app.post('/api/me/favorites/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  const f = req.user.favorites;
  const i = f.indexOf(id);
  i >= 0 ? f.splice(i, 1) : f.push(id);
  save();
  res.json({ favorites: f });
});

/* ---------- admin: properties ---------- */
const clean = (b) => ({
  title: String(b.title || '').trim(),
  type: b.type === 'rent' ? 'rent' : 'sale',
  price: Number(b.price) || 0,
  city: String(b.city || '').trim(),
  beds: Number(b.beds) || 0,
  baths: Number(b.baths) || 0,
  sqm: Number(b.sqm) || 0,
  image: String(b.image || ''),
  description: String(b.description || ''),
  featured: !!b.featured
});

app.post('/api/admin/properties', auth, admin, (req, res) => {
  const d = clean(req.body);
  if (!d.title) return res.status(400).json({ error: 'Title is required.' });
  const p = { id: db.counters.property++, ...d, createdAt: new Date().toISOString() };
  db.properties.push(p); save();
  res.json(p);
});
app.put('/api/admin/properties/:id', auth, admin, (req, res) => {
  const p = db.properties.find((x) => x.id === Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Not found' });
  Object.assign(p, clean({ ...p, ...req.body }));
  save();
  res.json(p);
});
app.delete('/api/admin/properties/:id', auth, admin, (req, res) => {
  const n = db.properties.length;
  db.properties = db.properties.filter((x) => x.id !== Number(req.params.id));
  save();
  res.json({ deleted: n - db.properties.length });
});

/* ---------- admin: images ---------- */
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_r, f, cb) => cb(null, Date.now() + '-' + f.originalname.replace(/[^\w.\-]/g, '_'))
});
const upload = multer({
  storage, limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_r, f, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(f.mimetype))
});

const listImages = () => {
  const out = [];
  for (const [dir, prefix] of [[IMG_DIR, ''], [UPLOAD_DIR, 'uploads/']]) {
    for (const f of fs.readdirSync(dir)) {
      if (/\.(jpe?g|png|webp|gif)$/i.test(f)) out.push(prefix + f);
    }
  }
  return out;
};
app.get('/api/admin/images', auth, admin, (_req, res) => res.json(listImages()));
app.post('/api/admin/images', auth, admin, upload.array('images', 20), (req, res) =>
  res.json((req.files || []).map((f) => 'uploads/' + f.filename)));
app.delete('/api/admin/images', auth, admin, (req, res) => {
  const name = String(req.query.name || '');
  if (!name.startsWith('uploads/') || name.includes('..'))
    return res.status(400).json({ error: 'Only uploaded images can be deleted.' });
  const f = path.join(IMG_DIR, name);
  if (fs.existsSync(f)) fs.unlinkSync(f);
  res.json({ ok: true });
});

/* ---------- admin: stats, inquiries, users ---------- */
app.get('/api/admin/stats', auth, admin, (_req, res) => {
  const now = Date.now(), day = 86400000;
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const start = new Date(now - i * day); start.setHours(0, 0, 0, 0);
    const s = start.getTime(), e = s + day;
    const v = db.visits.filter((x) => x.t >= s && x.t < e);
    days.push({ date: start.toISOString().slice(0, 10), views: v.length, visitors: new Set(v.map((x) => x.v)).size });
  }
  const perProp = {};
  db.visits.forEach((v) => { if (v.propertyId) perProp[v.propertyId] = (perProp[v.propertyId] || 0) + 1; });
  const topProperties = Object.entries(perProp)
    .map(([id, views]) => ({ id: Number(id), views, title: (db.properties.find((p) => p.id == id) || {}).title || 'Removed' }))
    .sort((a, b) => b.views - a.views).slice(0, 5);
  const perPage = {};
  db.visits.forEach((v) => { perPage[v.path] = (perPage[v.path] || 0) + 1; });
  const topPages = Object.entries(perPage).map(([p, views]) => ({ path: p, views })).sort((a, b) => b.views - a.views).slice(0, 6);
  res.json({
    totals: {
      views: db.visits.length,
      visitors: new Set(db.visits.map((v) => v.v)).size,
      users: db.users.filter((u) => u.role === 'user').length,
      properties: db.properties.length,
      forSale: db.properties.filter((p) => p.type === 'sale').length,
      forRent: db.properties.filter((p) => p.type === 'rent').length,
      inquiries: db.inquiries.length,
      newInquiries: db.inquiries.filter((i) => i.status === 'new').length
    },
    days, topProperties, topPages
  });
});
app.get('/api/admin/inquiries', auth, admin, (_req, res) => res.json(db.inquiries.slice().reverse()));
app.put('/api/admin/inquiries/:id', auth, admin, (req, res) => {
  const i = db.inquiries.find((x) => x.id === Number(req.params.id));
  if (!i) return res.status(404).json({ error: 'Not found' });
  i.status = req.body.status || i.status; save();
  res.json(i);
});
app.get('/api/admin/users', auth, admin, (_req, res) => res.json(db.users.map(publicUser)));

/* ---------- static site ---------- */
if (!fs.existsSync(path.join(__dirname, 'public', 'index.html')))
  console.warn('WARNING: public/index.html not found. Upload the whole "public" folder (with css, js, images) next to server.js.');
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`AEON Homes running on http://localhost:${PORT}`);
  console.log(`Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
});
