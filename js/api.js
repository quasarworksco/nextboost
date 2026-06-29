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
    // 1. Get user balance
    const userRef  = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new Error('Usuario no encontrado.');

    const userData = userSnap.data();
    const balance  = parseFloat(userData.balance || 0);

    // 2. Calculate cost using the catalog rate (already set by admin, no markup needed)
    const providerRate = parseFloat(service.rate);  // per 1000 — this is the client-facing rate
    const userRate     = providerRate;
    const charge       = +((userRate * quantity) / 1000).toFixed(6);

    if (balance < charge) throw new Error(`Saldo insuficiente. Necesitas $${charge.toFixed(4)}, tienes $${balance.toFixed(4)}.`);

    // 3. Deduct balance optimistically
    await userRef.update({ balance: firebase.firestore.FieldValue.increment(-charge) });

    // 4. Call provider
    let providerOrderId = null;
    try {
      const resp = await SmmAPI.addOrder({ service: service.id, link, quantity });
      providerOrderId = resp.order;
    } catch (err) {
      // Refund if provider fails
      await userRef.update({ balance: firebase.firestore.FieldValue.increment(charge) });
      throw new Error('Error del proveedor: ' + err.message);
    }

    // 5. Save order to Firestore
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const order = {
      userId,
      serviceId:       service.id,
      serviceName:     service.name,
      category:        service.category,
      link,
      quantity:        parseInt(quantity),
      providerRate,
      userRate,
      charge,
      status:          'pending',
      providerOrderId,
      refill:          service.refill || false,
      cancel:          service.cancel || false,
      createdAt:       now,
    };
    const batch = db.batch();
    const orderRef = db.collection('orders').doc();
    batch.set(orderRef, order);
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
    const withProvider = orders.filter(o => o.providerOrderId);
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
  const CATALOG_TTL = 6 * 60 * 60 * 1000; // 6 hours
  let _memCache = null;

  function _saveToStorage(data) {
    try {
      localStorage.setItem(CATALOG_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch(e) {}
  }

  function _loadFromStorage() {
    try {
      const raw = localStorage.getItem(CATALOG_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.ts > CATALOG_TTL) { localStorage.removeItem(CATALOG_KEY); return null; }
      return parsed.data;
    } catch(e) { return null; }
  }

  function clearCache() {
    _memCache = null;
    try { localStorage.removeItem(CATALOG_KEY); } catch(e) {}
  }

  async function getAll() {
    if (_memCache) return _memCache;
    const stored = _loadFromStorage();
    if (stored) { _memCache = stored; return _memCache; }

    // Read from catalog collection (admin's curated list with custom names/prices)
    const catSnap = await db.collection('catalog').get();
    if (!catSnap.empty) {
      _memCache = catSnap.docs.map(d => {
        const data = d.data();
        return {
          id:       data.serviceId || d.id,
          name:     data.displayName || data.name,
          category: data.displayCategory || data.category,
          rate:     data.rate,
          min:      data.min,
          max:      data.max,
          type:     data.type,
          refill:   data.refill,
          cancel:   data.cancel,
        };
      }).sort((a,b) => parseFloat(a.rate) - parseFloat(b.rate));
      _saveToStorage(_memCache);
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
