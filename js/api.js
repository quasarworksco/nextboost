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

    // 2. Calculate cost (provider cost × markup from settings)
    const settingsSnap = await db.collection('settings').doc('main').get();
    const settings     = settingsSnap.exists ? settingsSnap.data() : {};
    const markup       = parseFloat(settings.markup || APP.markup);

    const servicesSnap = await db.collection('services').doc(String(service.id)).get();
    const providerRate = parseFloat(service.rate);  // per 1000
    const userRate     = +(providerRate * markup).toFixed(6);
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
      createdAt:       firebase.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await db.collection('orders').add(order);
    return { id: ref.id, ...order };
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

  let _cache = null;

  async function getAll() {
    if (_cache) return _cache;
    const snap = await db.collection('services').orderBy('category').orderBy('name').get();
    if (snap.empty) return [];
    _cache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return _cache;
  }

  // Admin: sync services from provider API and save to Firestore
  async function syncFromProvider(markup) {
    const raw = await SmmAPI.getServices();
    // get existing doc IDs to know which are new
    const existingSnap = await db.collection('services').select().get();
    const existingIds  = new Set(existingSnap.docs.map(d => d.id));

    for (let i = 0; i < raw.length; i += 400) {
      const batch = db.batch();
      raw.slice(i, i + 400).forEach(s => {
        const docId    = String(s.service);
        const userRate = +(parseFloat(s.rate) * markup).toFixed(6);
        const ref      = db.collection('services').doc(docId);
        const base = {
          id:           s.service,
          name:         s.name,
          category:     s.category,
          type:         s.type,
          providerRate: parseFloat(s.rate),
          min:          parseInt(s.min),
          max:          parseInt(s.max),
          refill:       s.refill || false,
          cancel:       s.cancel || false,
          updatedAt:    firebase.firestore.FieldValue.serverTimestamp(),
        };
        if (!existingIds.has(docId)) {
          // New service — set defaults
          batch.set(ref, { ...base, rate: userRate, active: true });
        } else {
          // Existing — update metadata only, keep admin's rate/active
          batch.update(ref, base);
        }
      });
      await batch.commit();
    }
    _cache = null;
    return raw.length;
  }

  return { getAll, syncFromProvider };
})();
