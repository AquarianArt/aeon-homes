/* AEON Homes – shared front-end helpers (loaded by every page).
   Wrapped in a function so only the names the pages use become globals
   (pages declare their own `esc`, `props`, `f`, `u`, ... and must not clash). */
(function () {
  'use strict';

  /* ---------- tiny helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const peso = (n) => '₱' + Math.round(Number(n) || 0).toLocaleString('en-PH');

  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  };

  const Auth = {
    get token() { return LS.get('aeon_token'); },
    get user() { try { return JSON.parse(LS.get('aeon_user') || 'null'); } catch { return null; } },
    set(token, user) { LS.set('aeon_token', token); LS.set('aeon_user', JSON.stringify(user)); },
    clear() { LS.del('aeon_token'); LS.del('aeon_user'); }
  };

  async function api(path, opts = {}) {
    const headers = {};
    if (Auth.token) headers.Authorization = 'Bearer ' + Auth.token;
    let body = opts.body;
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const res = await fetch(path, { method: opts.method || 'GET', headers, body });
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) throw new Error((data && data.error) || 'Something went wrong (' + res.status + ').');
    return data;
  }

  let toastTimer;
  function toast(msg) {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  function track(propertyId) {
    api('/api/track', { method: 'POST', body: { path: location.pathname, propertyId: propertyId || null } }).catch(() => {});
  }

  /* ---------- favourites ---------- */
  let favState = new Set();
  async function loadFavs() {
    if (!Auth.token) { favState = new Set(); return []; }
    try {
      const list = await api('/api/me/favorites');
      favState = new Set(list.map((p) => p.id));
      return [...favState];
    } catch { return []; }
  }

  /* ---------- property cards ---------- */
  function cardHtml(p, favs) {
    const on = (favs || []).includes(p.id);
    const rent = p.type === 'rent';
    return `<article class="card" data-id="${p.id}">
      <div class="img"><img src="/images/${esc(p.image)}" alt="${esc(p.title)}" loading="lazy"></div>
      <span class="badge">${rent ? 'For rent' : 'For sale'}</span>
      <button class="heart${on ? ' on' : ''}" data-fav="${p.id}" aria-label="Save home">${on ? '♥' : '♡'}</button>
      <div class="body">
        <h3>${esc(p.title)}</h3>
        <p class="loc">${esc(p.city)}</p>
        <div class="price">${peso(p.price)}${rent ? ' <small>/ month</small>' : ''}</div>
        <div class="meta"><span>${Number(p.beds) || 0} bed</span><span>${Number(p.baths) || 0} bath</span><span>${Number(p.sqm) || 0} sqm</span></div>
        <div class="actions"><button class="btn orange sm" data-book="${p.id}">BOOK A VIEWING</button></div>
      </div>
    </article>`;
  }

  function wireCards(container, list) {
    if (!container) return;
    container.onclick = async (e) => {
      const heart = e.target.closest('[data-fav]');
      if (heart) {
        if (!Auth.token) { toast('Please log in to save homes.'); openAuth('login'); return; }
        const id = Number(heart.dataset.fav);
        try {
          const d = await api('/api/me/favorites/' + id, { method: 'POST' });
          favState = new Set(d.favorites);
          const on = favState.has(id);
          heart.classList.toggle('on', on);
          heart.textContent = on ? '♥' : '♡';
          if (!on && container.id === 'favGrid') {
            heart.closest('.card').remove();
            if (!container.children.length) container.innerHTML = '<p class="sub">No saved homes yet. Tap the heart on any property to save it.</p>';
          }
        } catch (err) { toast(err.message); }
        return;
      }
      const card = e.target.closest('.card');
      if (card && card.dataset.id) track(Number(card.dataset.id));
      const book = e.target.closest('[data-book]');
      if (book) openBooking((list || []).find((p) => p.id === Number(book.dataset.book)) || null);
    };
  }

  /* ---------- listing grid with filters ---------- */
  async function mountListing({ type = '', mount }) {
    const el = typeof mount === 'string' ? $(mount) : mount;
    if (!el) return;
    const run = (el._run = (el._run || 0) + 1);
    el.innerHTML = '<p class="sub">Loading homes…</p>';
    let all, favs;
    try {
      [all, favs] = await Promise.all([api('/api/properties' + (type ? '?type=' + encodeURIComponent(type) : '')), loadFavs()]);
    } catch {
      if (run === el._run) el.innerHTML = '<p class="sub">Sorry, we could not load the homes right now. Please try again.</p>';
      return;
    }
    if (run !== el._run) return; // a newer call (e.g. tab switch) took over

    const cities = [...new Set(all.map((p) => p.city))].sort();
    el.innerHTML = `<div class="filters">
        <input type="search" class="f-q" placeholder="Search by name or city" style="flex:1;min-width:220px">
        <select class="f-city"><option value="">All cities</option>${cities.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
        <select class="f-sort"><option value="">Featured first</option><option value="asc">Price: low to high</option><option value="desc">Price: high to low</option></select>
      </div><div class="grid"></div>`;
    const grid = $('.grid', el), q = $('.f-q', el), city = $('.f-city', el), sort = $('.f-sort', el);

    const render = () => {
      const term = q.value.trim().toLowerCase();
      let rows = all.filter((p) => (!city.value || p.city === city.value) && (!term || (p.title + ' ' + p.city).toLowerCase().includes(term)));
      if (sort.value === 'asc') rows.sort((a, b) => a.price - b.price);
      else if (sort.value === 'desc') rows.sort((a, b) => b.price - a.price);
      else rows.sort((a, b) => Number(b.featured) - Number(a.featured));
      const ids = [...favState];
      grid.innerHTML = rows.length ? rows.map((p) => cardHtml(p, ids)).join('') : '<p class="sub">No homes match your search.</p>';
    };
    q.oninput = city.onchange = sort.onchange = render;
    render();
    wireCards(grid, all);
  }

  /* ---------- modals (login / sign up / booking) ---------- */
  let authMode = 'login';

  function ensureModals() {
    if ($('#authModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal" id="authModal"><div class="box">
        <button class="x" type="button" aria-label="Close">×</button>
        <h2 id="authTitle">Log in</h2>
        <form class="form" id="authForm">
          <label id="authNameRow" class="hidden">Full name<input name="name" autocomplete="name"></label>
          <label>Email<input name="email" type="email" required autocomplete="email"></label>
          <label>Password<input name="password" type="password" minlength="6" required autocomplete="current-password"></label>
          <div class="err" id="authErr"></div>
          <button class="btn orange sm" type="submit" id="authBtn">LOG IN</button>
          <button class="linkbtn" type="button" id="authSwitch" style="text-align:left"></button>
        </form>
      </div></div>
      <div class="modal" id="bookModal"><div class="box">
        <button class="x" type="button" aria-label="Close">×</button>
        <h2 id="bookTitle">Book a viewing</h2>
        <p class="sub" id="bookProp" style="margin-bottom:14px"></p>
        <form class="form" id="bookForm">
          <div class="row"><label>Full name<input name="name" required></label><label>Email<input name="email" type="email" required></label></div>
          <div class="row"><label>Phone<input name="phone" type="tel"></label><label>Preferred date<input name="date" type="date"></label></div>
          <label>Message<textarea name="message" rows="3"></textarea></label>
          <div class="err" id="bookErr"></div>
          <button class="btn orange sm" type="submit">SEND REQUEST</button>
        </form>
      </div></div>`);

    $$('.modal').forEach((m) => m.addEventListener('click', (e) => {
      if (e.target === m || e.target.closest('.x')) m.classList.remove('open');
    }));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.modal.open').forEach((m) => m.classList.remove('open')); });

    $('#authSwitch').onclick = () => openAuth(authMode === 'login' ? 'register' : 'login');

    $('#authForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target, err = $('#authErr');
      err.textContent = '';
      const el = f.elements;
      const body = authMode === 'login'
        ? { email: el.email.value, password: el.password.value }
        : { name: el.name.value, email: el.email.value, password: el.password.value };
      try {
        const d = await api('/api/auth/' + authMode, { method: 'POST', body });
        Auth.set(d.token, d.user);
        if (d.user.role === 'admin') location.href = '/admin.html'; else location.reload();
      } catch (ex) { err.textContent = ex.message; }
    };

    $('#bookForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target, el = f.elements, err = $('#bookErr'), ctx = f._ctx || {};
      err.textContent = '';
      try {
        await api('/api/inquiries', {
          method: 'POST',
          body: {
            kind: ctx.kind || 'booking', name: el.name.value, email: el.email.value, phone: el.phone.value,
            message: el.message.value, propertyId: ctx.propertyId || null,
            details: el.date.value ? { preferredDate: el.date.value } : null
          }
        });
        $('#bookModal').classList.remove('open');
        el.message.value = '';
        toast("Thanks! We'll be in touch shortly.");
      } catch (ex) { err.textContent = ex.message; }
    };
  }

  function openAuth(mode) {
    ensureModals();
    authMode = mode === 'register' ? 'register' : 'login';
    const reg = authMode === 'register';
    $('#authTitle').textContent = reg ? 'Create your account' : 'Log in';
    $('#authBtn').textContent = reg ? 'SIGN UP' : 'LOG IN';
    $('#authSwitch').textContent = reg ? 'Already have an account? Log in' : 'New here? Create an account';
    $('#authNameRow').classList.toggle('hidden', !reg);
    const ae = $('#authForm').elements;
    ae.name.required = reg;
    ae.password.autocomplete = reg ? 'new-password' : 'current-password';
    $('#authErr').textContent = '';
    $('#authModal').classList.add('open');
  }

  function openBooking(property) {
    ensureModals();
    const f = $('#bookForm'), el = f.elements, u = Auth.user;
    const mortgage = !property && /mortgage/i.test(location.pathname);
    f._ctx = { kind: mortgage ? 'mortgage' : 'booking', propertyId: property ? property.id : null };
    $('#bookTitle').textContent = property ? 'Book a viewing' : mortgage ? 'Talk to a mortgage advisor' : 'Book a consultation';
    $('#bookProp').textContent = property ? property.title + ' · ' + property.city : 'Tell us a little about what you are looking for.';
    if (u) { if (!el.name.value) el.name.value = u.name; if (!el.email.value) el.email.value = u.email; }
    el.date.min = new Date().toISOString().slice(0, 10);
    $('#bookErr').textContent = '';
    $('#bookModal').classList.add('open');
  }

  /* ---------- page chrome: nav + footer ---------- */
  function mountChrome(active, solid) {
    ensureModals();
    const u = Auth.user;
    const links = [['properties', 'Properties', '/properties.html'], ['buy', 'Buy', '/buy.html'], ['sell', 'Sell', '/sell.html'], ['rent', 'Rent', '/rent.html'], ['mortgage', 'Mortgage', '/mortgage.html']];
    const actions = u
      ? `${u.role === 'admin' ? '<a class="pill light" href="/admin.html">Admin</a>' : ''}<a class="pill light" href="/account.html">My account</a><button class="pill orange" id="navOut" type="button">Log out</button>`
      : '<button class="pill light" id="navIn" type="button">Log in</button><button class="pill orange" id="navUp" type="button">Sign up</button>';

    document.body.insertAdjacentHTML('afterbegin', `<nav class="nav${solid ? ' solid' : ''}" id="siteNav">
      <a class="logo" href="/"><img src="/images/logo.jpg" alt="AEON Homes"></a>
      <button class="burger" type="button" aria-label="Menu">☰</button>
      <ul class="nav-links">${links.map(([k, t, h]) => `<li><a href="${h}"${k === active ? ' class="active"' : ''}>${t}</a></li>`).join('')}</ul>
      <div class="nav-actions">${actions}</div>
    </nav>`);
    document.body.insertAdjacentHTML('beforeend', '<footer><span>© ' + new Date().getFullYear() + ' AEON Homes. All rights reserved.</span><span>Luxury homes across the Philippines</span></footer>');

    const nav = $('#siteNav');
    $('.logo img', nav).addEventListener('error', function () { this.outerHTML = '<span class="fallback">AEON</span>'; });
    $('.burger', nav).onclick = () => nav.classList.toggle('open');
    const on = (id, fn) => { const b = $(id, nav); if (b) b.onclick = fn; };
    on('#navIn', () => openAuth('login'));
    on('#navUp', () => openAuth('register'));
    on('#navOut', () => { Auth.clear(); location.href = '/'; });

    track(null);
  }

  Object.assign(window, { $, $$, api, Auth, peso, toast, cardHtml, wireCards, loadFavs, mountListing, mountChrome, openBooking });
})();
