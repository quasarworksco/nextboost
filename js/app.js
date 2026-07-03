// ══════════════════════════════════════════════════════
// NextBoost — Shared utilities (auth, toast, helpers)
// ══════════════════════════════════════════════════════

// ── PWA service worker ────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ── Toast notifications ───────────────────────────────
const TOAST_ICONS = {
  success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  error:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  info:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
};

function toast(msg, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <span class="toast-icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</span>
    <span class="toast-msg">${msg}</span>
    <span class="toast-progress" style="animation-duration:${duration}ms"></span>
  `;
  el.addEventListener('click', () => dismissToast(el));
  container.appendChild(el);
  setTimeout(() => dismissToast(el), duration);
}

function dismissToast(el) {
  if (el._dismissed) return;
  el._dismissed = true;
  el.classList.add('toast-exit');
  setTimeout(() => el.remove(), 350);
}

// ── Animated count-up for stat values ─────────────────
// Usage: countUp(element, 1234) or countUp(element, 45.5, { prefix: '$', decimals: 2 })
function countUp(el, target, { prefix = '', decimals = 0, duration = 700 } = {}) {
  if (!el) return;
  const start = performance.now();
  const from  = 0;
  function frame(nowTs) {
    const p = Math.min((nowTs - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
    const val = from + (target - from) * eased;
    el.textContent = prefix + val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ── Empty state builder ───────────────────────────────
// Returns a full-width table row with icon, title, subtitle and
// optional action button. Icons: 'box', 'card', 'users', 'chart'.
const EMPTY_ICONS = {
  box:   '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  card:  '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
  users: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  chart: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.1-2.8-2.8L7 14"/></svg>',
};

function emptyStateRow(cols, { icon = 'box', title = 'Sin registros', sub = '', actionHtml = '' } = {}) {
  return `<tr><td colspan="${cols}" style="padding:0">
    <div class="empty-state">
      <div class="empty-icon">${EMPTY_ICONS[icon] || EMPTY_ICONS.box}</div>
      <div class="empty-title">${title}</div>
      ${sub ? `<div class="empty-sub">${sub}</div>` : ''}
      ${actionHtml}
    </div>
  </td></tr>`;
}

// ── Skeleton loader row builder ───────────────────────
// Returns table rows of shimmering placeholder bars.
function skeletonRows(cols, rows = 4) {
  let out = '';
  for (let i = 0; i < rows; i++) {
    out += '<tr class="skeleton-row">';
    for (let c = 0; c < cols; c++) {
      const w = 40 + ((i * 7 + c * 13) % 45); // deterministic varied widths
      out += `<td><span class="skeleton-bar" style="width:${w}%"></span></td>`;
    }
    out += '</tr>';
  }
  return out;
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
  auth.onAuthStateChanged(async user => {
    if (!user) { window.location.href = 'login.html'; return; }
    const snap = await db.collection('users').doc(user.uid).get();
    if (snap.exists && snap.data().blocked) {
      auth.signOut();
      window.location.href = 'login.html?blocked=1';
      return;
    }
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
    reversed:   'badge-canceled',
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
