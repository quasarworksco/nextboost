// ══════════════════════════════════════════════════════
// NextBoost — SMM Provider API wrapper
// Compatible with any JustAnotherPanel-style API
// (fansfull.com, justanotherpanel.com, etc.)
// ══════════════════════════════════════════════════════

const SmmAPI = (() => {
  // The Cloudflare Worker injects the JAP key — we never send it from the browser.
  async function _call(params) {
    const body = new URLSearchParams(params); // no 'key' — Worker adds it
    const res  = await fetch(PROVIDER.url, { method: 'POST', body });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  async function init() {} // no-op (kept for backward compatibility)

  // List all services from provider
  async function getServices() {
    return _call({ action: 'services' });
  }

  // Place a new order
  async function addOrder({ service, link, quantity, runs, interval }) {
    const params = { action: 'add', service, link, quantity };
    if (runs)     params.runs     = runs;
    if (interval) params.interval = interval;
    return _call(params);
  }

  // Get status — single order uses `order`, multiple uses `orders`
  async function getStatus(orderIds) {
    const arr = Array.isArray(orderIds) ? orderIds : [orderIds];
    if (arr.length === 1) return _call({ action: 'status', order: arr[0] });
    return _call({ action: 'status', orders: arr.join(',') });
  }

  // Request refill — single uses `order`, multiple uses `orders`
  async function refill(orderIds) {
    const arr = Array.isArray(orderIds) ? orderIds : [orderIds];
    if (arr.length === 1) return _call({ action: 'refill', order: arr[0] });
    return _call({ action: 'refill', orders: arr.join(',') });
  }

  // Get refill status
  async function refillStatus(refillIds) {
    const arr = Array.isArray(refillIds) ? refillIds : [refillIds];
    if (arr.length === 1) return _call({ action: 'refill_status', refill: arr[0] });
    return _call({ action: 'refill_status', refills: arr.join(',') });
  }

  // Cancel orders (always comma-separated list)
  async function cancel(orderIds) {
    const ids = Array.isArray(orderIds) ? orderIds.join(',') : orderIds;
    return _call({ action: 'cancel', orders: ids });
  }

  // Provider wallet balance
  async function getBalance() {
    return _call({ action: 'balance' });
  }

  return { init, getServices, addOrder, getStatus, refill, refillStatus, cancel, getBalance };
})();

// ══════════════════════════════════════════════════════
// Firestore order management
// ══════════════════════════════════════════════════════

const Orders = (() => {

  // Place order: deduct balance → call provider API → save to Firestore
  async function place({ userId, service, link, quantity }) {
    // 1. Get user balance + settings in parallel
    const [userSnap, settingsSnap] = await Promise.all([
      db.collection('users').doc(userId).get(),
      db.collection('settings').doc('main').get(),
    ]);
    const userRef = db.collection('users').doc(userId);
    if (!userSnap.exists) throw new Error('Usuario no encontrado.');

    // 1b. Check active order limit
    const maxActive = (settingsSnap.exists && settingsSnap.data().maxActiveOrders) || 10;
    const activeSnap = await db.collection('orders')
      .where('userId', '==', userId)
      .where('status', 'in', ['pending', 'active', 'in progress'])
      .limit(maxActive + 1)
      .get();
    if (activeSnap.size >= maxActive) {
      throw new Error(`Tienes ${activeSnap.size} pedidos activos. El límite es ${maxActive}. Espera a que se completen antes de hacer otro.`);
    }

    // 1c. Check for identical duplicate order (same service + link, active/pending)
    const dupSnap = await db.collection('orders')
      .where('userId', '==', userId)
      .where('serviceId', '==', String(service.id))
      .where('link', '==', link)
      .where('status', 'in', ['pending', 'active', 'in progress'])
      .limit(1)
      .get();
    if (!dupSnap.empty) {
      throw new Error('Ya tienes un pedido activo para ese enlace con el mismo servicio. Espera a que se complete antes de repetirlo.');
    }

    const userData = userSnap.data();
    const balance  = parseFloat(userData.balance || 0);

    // 2. Calculate cost — rate is what client pays, providerRate is what admin pays provider
    const providerRate  = parseFloat(service.providerRate || service.rate); // admin's actual cost
    const userRate      = parseFloat(service.rate);                          // client-facing price
    const charge        = +((userRate      * quantity) / 1000).toFixed(6);
    const providerCost  = +((providerRate  * quantity) / 1000).toFixed(6);

    if (balance < charge) throw new Error(`Saldo insuficiente. Necesitas $${charge.toFixed(4)}, tienes $${balance.toFixed(4)}.`);

    // 3. Call provider first (before touching balance)
    let providerOrderId = null;
    try {
      const resp = await SmmAPI.addOrder({ service: service.id, link, quantity });
      providerOrderId = resp.order;
    } catch (err) {
      throw new Error('Error del proveedor: ' + err.message);
    }

    // 4. Atomic batch: deduct balance + save order + save balance_history
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const order = {
      userId,
      userEmail:       userData.email || null,
      userName:        userData.name  || null,
      serviceId:       service.id,
      serviceName:     service.name,
      category:        service.category,
      link,
      quantity:        parseInt(quantity),
      providerRate,
      userRate,
      charge,
      providerCost,
      status:          'pending',
      providerOrderId,
      refill:          service.refill || false,
      cancel:          service.cancel || false,
      createdAt:       now,
    };
    const batch = db.batch();
    const orderRef = db.collection('orders').doc();
    batch.set(orderRef, order);
    batch.update(userRef, { balance: firebase.firestore.FieldValue.increment(-charge) });
    batch.set(db.collection('balance_history').doc(), {
      userId,
      type: 'order',
      amount: -charge,
      description: `Pedido: ${service.name?.slice(0, 60) || service.id} (x${parseInt(quantity)})`,
      createdAt: now,
    });
    await batch.commit();
    return { id: orderRef.id, ...order };
  }

  // Fetch orders for a user
  async function getForUser(userId, limitN = 50) {
    const snap = await db.collection('orders')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limitN)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  // Fetch all orders (admin)
  async function getAll(limitN = 100) {
    const snap = await db.collection('orders')
      .orderBy('createdAt', 'desc')
      .limit(limitN)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  // Sync status from provider
  async function syncStatus(orders) {
    if (!orders.length) return;
    const TERMINAL = ['completed', 'cancelled', 'partial', 'canceled'];
    const withProvider = orders.filter(o =>
      o.providerOrderId && !TERMINAL.includes((o.status || '').toLowerCase())
    );
    if (!withProvider.length) return;

    const ids     = withProvider.map(o => o.providerOrderId);
    // For multiple orders JAP returns { "providerId": { charge, status, ... } }
    const results = await SmmAPI.getStatus(ids);

    const batch = db.batch();
    withProvider.forEach(o => {
      // Single-order response has status directly; multi-order keyed by provider ID
      const r = ids.length === 1 ? results : results[o.providerOrderId];
      if (r && !r.error) {
        const ref = db.collection('orders').doc(o.id);
        batch.update(ref, {
          status:     (r.status || 'pending').toLowerCase(),
          remains:    r.remains    || null,
          startCount: r.start_count || null,
        });
      }
    });
    await batch.commit();
  }

  return { place, getForUser, getAll, syncStatus };
})();

// ══════════════════════════════════════════════════════
// Service catalog (cached in Firestore)
// ══════════════════════════════════════════════════════

const Services = (() => {

  const CATALOG_KEY = 'nb_catalog_cache';
  const CATALOG_TTL = 6 * 60 * 60 * 1000; // 6 hours — fallback if version check fails
  let _memCache = null;

  function _saveToStorage(data, version) {
    try {
      localStorage.setItem(CATALOG_KEY, JSON.stringify({ ts: Date.now(), version: version || null, data }));
    } catch(e) {}
  }

  function _loadFromStorage() {
    try {
      const raw = localStorage.getItem(CATALOG_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.ts > CATALOG_TTL) { localStorage.removeItem(CATALOG_KEY); return null; }
      return parsed;
    } catch(e) { return null; }
  }

  function clearCache() {
    _memCache = null;
    try { localStorage.removeItem(CATALOG_KEY); } catch(e) {}
  }

  async function getAll() {
    if (_memCache) return _memCache;
    const stored = _loadFromStorage();

    // Cheap single-doc read to check if admin published a newer catalog version
    let serverVersion = null;
    try {
      const verSnap = await db.collection('settings').doc('main').get();
      serverVersion = verSnap.exists ? (verSnap.data().catalogVersion || null) : null;
    } catch(e) {}

    if (stored && (!serverVersion || stored.version === serverVersion)) {
      _memCache = stored.data;
      return _memCache;
    }

    // Read from catalog collection (admin's curated list with custom names/prices)
    const catSnap = await db.collection('catalog').get();
    if (!catSnap.empty) {
      _memCache = catSnap.docs.map(d => {
        const data = d.data();
        return {
          id:           data.serviceId || d.id,
          name:         data.displayName || data.name,
          category:     data.displayCategory || data.category,
          rate:         data.rate,
          providerRate: data.providerRate || data.rate,
          min:          data.min,
          max:          data.max,
          type:         data.type,
          refill:       data.refill,
          cancel:       data.cancel,
        };
      }).sort((a,b) => parseFloat(a.rate) - parseFloat(b.rate));
      _saveToStorage(_memCache, serverVersion);
      return _memCache;
    }
    return [];
  }

  // Kept for backward compatibility — no longer writes to Firestore
  async function syncFromProvider() {
    clearCache();
    return 0;
  }

  return { getAll, syncFromProvider, clearCache };
})();
