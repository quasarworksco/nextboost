// ══════════════════════════════════════════════════════
// NexBoost — SMM Provider API wrapper
// Compatible with any JustAnotherPanel-style API
// (fansfull.com, justanotherpanel.com, etc.)
// ══════════════════════════════════════════════════════

const SmmAPI = (() => {
  let _apiKey = null;
  let _apiUrl = null;

  // Load provider credentials from Firestore settings (admin-only doc)
  async function init() {
    try {
      const snap = await db.collection('settings').doc('main').get();
      if (snap.exists) {
        const d = snap.data();
        _apiKey = d.smmApiKey || null;
        _apiUrl = d.smmApiUrl || PROVIDER.url;
      }
    } catch (e) {
      console.warn('SmmAPI: could not load settings', e);
    }
  }

  async function _call(params) {
    if (!_apiKey) await init();
    if (!_apiKey) throw new Error('API key not configured. Go to Admin > Settings.');

    const body = new URLSearchParams({ key: _apiKey, ...params });
    const res  = await fetch(_apiUrl, { method: 'POST', body });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

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

  // Get status of one or multiple orders
  async function getStatus(orderIds) {
    const ids = Array.isArray(orderIds) ? orderIds.join(',') : orderIds;
    return _call({ action: 'status', orders: ids });
  }

  // Request refill
  async function refill(orderIds) {
    const ids = Array.isArray(orderIds) ? orderIds.join(',') : orderIds;
    return _call({ action: 'refill', orders: ids });
  }

  // Cancel orders
  async function cancel(orderIds) {
    const ids = Array.isArray(orderIds) ? orderIds.join(',') : orderIds;
    return _call({ action: 'cancel', orders: ids });
  }

  // Provider wallet balance
  async function getBalance() {
    return _call({ action: 'balance' });
  }

  return { init, getServices, addOrder, getStatus, refill, cancel, getBalance };
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
    const results = await SmmAPI.getStatus(ids);
    const batch   = db.batch();
    withProvider.forEach(o => {
      const r = results[o.providerOrderId];
      if (r && !r.error) {
        const ref = db.collection('orders').doc(o.id);
        batch.update(ref, { status: (r.status || 'pending').toLowerCase(), remains: r.remains, startCount: r.start_count });
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
    const batch = db.batch();
    raw.forEach(s => {
      const userRate = +(parseFloat(s.rate) * markup).toFixed(6);
      const ref = db.collection('services').doc(String(s.service));
      batch.set(ref, {
        id:          s.service,
        name:        s.name,
        category:    s.category,
        type:        s.type,
        providerRate: parseFloat(s.rate),
        rate:        userRate,
        min:         parseInt(s.min),
        max:         parseInt(s.max),
        refill:      s.refill || false,
        cancel:      s.cancel || false,
        active:      true,
        updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
    _cache = null;
    return raw.length;
  }

  return { getAll, syncFromProvider };
})();
