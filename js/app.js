// ══════════════════════════════════════════════════════
// NextBoost — Shared utilities (auth, toast, helpers)
// ══════════════════════════════════════════════════════

// ── Toast notifications ───────────────────────────────
function toast(msg, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, duration);
}

// ── Format currency ───────────────────────────────────
function formatUSD(amount) {
  return '$' + parseFloat(amount || 0).toFixed(4).replace(/\.?0+$/, m => m.replace(/[^.]/g, '0').slice(0, 2) || '');
}
function formatUSD2(amount) {
  return '$' + parseFloat(amount || 0).toFixed(2);
}

// ── Date formatting ───────────────────────────────────
function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Modal helpers ─────────────────────────────────────
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('active');
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('active');
}
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('active');
  if (e.target.classList.contains('modal-close')) e.target.closest('.modal-overlay').classList.remove('active');
});

// ── Sidebar toggle ────────────────────────────────────
function initSidebar() {
  const hamburger = document.getElementById('hamburger');
  const sidebar   = document.getElementById('sidebar');
  if (!hamburger || !sidebar) return;

  let backdrop = document.querySelector('.sidebar-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);
  }

  function openSidebar()  { sidebar.classList.add('open');    backdrop.style.display = 'block'; }
  function closeSidebar() { sidebar.classList.remove('open'); backdrop.style.display = 'none';  }

  hamburger.addEventListener('click', () => sidebar.classList.contains('open') ? closeSidebar() : openSidebar());
  backdrop.addEventListener('click', closeSidebar);
  // close on nav item click (mobile)
  sidebar.querySelectorAll('.nav-item').forEach(el => el.addEventListener('click', () => { if (window.innerWidth < 900) closeSidebar(); }));
}

// ── Active nav ────────────────────────────────────────
function setActiveNav(pageId) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === pageId);
  });
}

// ── Page router (SPA-lite inside dashboard) ───────────
function showPage(pageId) {
  document.querySelectorAll('.page-section').forEach(s => s.style.display = 'none');
  const p = document.getElementById('page-' + pageId);
  if (p) p.style.display = 'block';
  setActiveNav(pageId);
  const title = document.getElementById('page-title');
  if (title) title.textContent = document.querySelector(`[data-page="${pageId}"]`)?.dataset.title || '';
}

// ── Auth guard ────────────────────────────────────────
function requireAuth(callback) {
  auth.onAuthStateChanged(user => {
    if (!user) { window.location.href = 'login.html'; return; }
    callback(user);
  });
}

function requireAdmin(callback) {
  auth.onAuthStateChanged(async user => {
    if (!user) { window.location.href = 'login.html'; return; }
    const snap = await db.collection('users').doc(user.uid).get();
    if (!snap.exists || snap.data().role !== 'admin') {
      window.location.href = 'dashboard.html';
      return;
    }
    callback(user, snap.data());
  });
}

// ── Load user balance ─────────────────────────────────
async function loadBalance(uid) {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? (snap.data().balance || 0) : 0;
}

// ── Badge helper ──────────────────────────────────────
function statusBadge(status) {
  const map = {
    pending:    'badge-pending',
    processing: 'badge-processing',
    active:     'badge-active',
    'in progress': 'badge-active',
    completed:  'badge-completed',
    partial:    'badge-partial',
    canceled:   'badge-canceled',
    cancelled:  'badge-canceled',
    approved:   'badge-approved',
    rejected:   'badge-rejected',
  };
  const cls = map[(status || '').toLowerCase()] || 'badge-pending';
  return `<span class="badge ${cls}">${status || 'pending'}</span>`;
}

// ── Sign out ──────────────────────────────────────────
function signOut() {
  auth.signOut().then(() => window.location.href = 'login.html');
}

// ── Auto-logout after 10 min inactivity ───────────────
(function initAutoLogout() {
  const TIMEOUT_MS = 10 * 60 * 1000;
  let timer;

  function reset() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      auth.signOut().then(() => {
        window.location.href = 'login.html?expired=1';
      });
    }, TIMEOUT_MS);
  }

  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(ev => {
    document.addEventListener(ev, reset, { passive: true });
  });

  reset();
})();

// ── Debounce ──────────────────────────────────────────
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
