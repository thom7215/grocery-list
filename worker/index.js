const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Family-Token',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function text(body, status = 200, contentType = 'text/plain') {
  return new Response(body, {
    status,
    headers: { ...CORS, 'Content-Type': contentType },
  });
}

function unauthorized() {
  return json({ error: 'Invalid or missing family token' }, 401);
}

function checkAuth(request, env) {
  const token = request.headers.get('X-Family-Token') || '';
  const expected = env.FAMILY_TOKEN || '';
  return Boolean(expected && token === expected);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function kvGet(env, key, fallback) {
  const raw = await env.DATA.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function kvPut(env, key, value) {
  await env.DATA.put(key, JSON.stringify(value));
}

function favoriteId(item) {
  if (!item || typeof item !== 'object') return null;
  const raw = item.id ?? item.showId ?? item.tvmazeId;
  const id = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(id) ? id : null;
}

function mergeFavoritesById(existing, incoming) {
  const byId = new Map();
  for (const f of existing) {
    const id = favoriteId(f);
    if (id != null) byId.set(id, f);
  }
  for (const f of incoming) {
    const id = favoriteId(f);
    if (id == null) continue;
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, f);
      continue;
    }
    byId.set(id, {
      ...prev,
      ...f,
      id,
      name: f.name || prev.name,
      posterPath: f.posterPath ?? f.poster ?? prev.posterPath ?? prev.poster ?? null,
    });
  }
  return Array.from(byId.values()).sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || '')),
  );
}

async function fetchRemote(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'FamilyDashboard/1.0' },
  });
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location');
    if (loc) return fetchRemote(loc);
  }
  return res;
}

function newId() {
  return String(Date.now()) + Math.random().toString(36).slice(2, 7);
}

async function loadGroceryStores(env) {
  let stores = await kvGet(env, 'grocery-stores', null);
  if (Array.isArray(stores)) return stores;

  const legacy = await kvGet(env, 'groceries', []);
  if (Array.isArray(legacy) && legacy.length) {
    stores = [{ id: newId(), name: 'General', items: legacy }];
    await kvPut(env, 'grocery-stores', stores);
    return stores;
  }

  stores = [{ id: newId(), name: 'General', items: [] }];
  await kvPut(env, 'grocery-stores', stores);
  return stores;
}

async function saveGroceryStores(env, stores) {
  await kvPut(env, 'grocery-stores', stores);
}

function findStore(stores, storeId) {
  return stores.find(s => String(s.id) === String(storeId));
}

function cleanAisle(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function insertStoreItem(store, item) {
  const items = store.items || [];
  const aisle = item.aisle || '';
  let at = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    if (!items[i].done && (items[i].aisle || '') === aisle) {
      at = i + 1;
      break;
    }
  }
  if (at < 0) {
    const firstDone = items.findIndex(i => i.done);
    at = firstDone < 0 ? items.length : firstDone;
  }
  items.splice(at, 0, item);
  store.items = items;
  if (aisle) {
    store.aisles = Array.isArray(store.aisles) ? store.aisles : [];
    if (!store.aisles.includes(aisle)) store.aisles.push(aisle);
  }
}

function flattenGroceries(stores) {
  return stores.flatMap(store =>
    (store.items || []).map(item => ({
      ...item,
      storeId: store.id,
      storeName: store.name,
    })),
  );
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/' || path === '/api/health') {
      return json({ ok: true, service: 'family-dashboard-api' });
    }

    if (path.startsWith('/api/tvmaze/')) {
      const target = `https://api.tvmaze.com${path.slice('/api/tvmaze'.length)}${url.search}`;
      try {
        const res = await fetchRemote(target);
        const body = await res.text();
        return text(body, res.status, res.headers.get('content-type') || 'application/json');
      } catch (err) {
        return text(`Proxy error: ${err.message}`, 502);
      }
    }

    if (path === '/api/ics') {
      const target = url.searchParams.get('url');
      if (!target || !/^https?:\/\//i.test(target)) {
        return text('Missing or invalid url parameter', 400);
      }
      try {
        const res = await fetchRemote(target.replace(/^webcal:\/\//i, 'https://'));
        const body = await res.text();
        return text(body, res.status, 'text/calendar; charset=utf-8');
      } catch (err) {
        return text(`Proxy error: ${err.message}`, 502);
      }
    }

    if (!checkAuth(request, env)) return unauthorized();

    // --- Multi-store groceries ---
    if (path === '/api/grocery-stores') {
      if (request.method === 'GET') {
        return json({ stores: await loadGroceryStores(env) });
      }
      if (request.method === 'PUT') {
        const body = await readJson(request);
        if (!body || !Array.isArray(body.stores)) {
          return json({ error: 'Expected { stores: [...] }' }, 400);
        }
        await saveGroceryStores(env, body.stores);
        return json({ stores: body.stores });
      }
      if (request.method === 'POST') {
        const body = await readJson(request);
        const name = body?.name?.trim();
        if (!name) return json({ error: 'Missing store name' }, 400);
        const stores = await loadGroceryStores(env);
        stores.push({ id: newId(), name, items: [], aisles: [], staples: [] });
        await saveGroceryStores(env, stores);
        return json({ stores });
      }
    }

    const storeMatch = path.match(/^\/api\/grocery-stores\/([^/]+)(?:\/items(?:\/([^/]+))?)?$/);
    if (storeMatch) {
      const storeId = storeMatch[1];
      const itemId = storeMatch[2];
      const stores = await loadGroceryStores(env);
      const store = findStore(stores, storeId);
      if (!store) return json({ error: 'Store not found' }, 404);
      store.items = store.items || [];

      if (path.endsWith('/items') && request.method === 'POST') {
        const body = await readJson(request);
        const itemText = body?.text?.trim();
        if (!itemText) return json({ error: 'Missing text' }, 400);
        insertStoreItem(store, {
          id: Date.now(),
          text: itemText,
          done: false,
          aisle: cleanAisle(body?.aisle),
        });
        await saveGroceryStores(env, stores);
        return json({ stores });
      }

      if (itemId && request.method === 'PATCH') {
        const body = await readJson(request);
        const item = store.items.find(i => String(i.id) === String(itemId));
        if (!item) return json({ error: 'Item not found' }, 404);
        if (typeof body?.done === 'boolean') item.done = body.done;
        if (typeof body?.text === 'string') item.text = body.text.trim();
        if (typeof body?.aisle === 'string') item.aisle = body.aisle.trim();
        await saveGroceryStores(env, stores);
        return json({ stores });
      }

      if (itemId && request.method === 'DELETE') {
        store.items = store.items.filter(i => String(i.id) !== String(itemId));
        await saveGroceryStores(env, stores);
        return json({ stores });
      }

      if (!itemId && request.method === 'PATCH') {
        const body = await readJson(request);
        const storeName = body?.name?.trim();
        if (!storeName) return json({ error: 'Missing store name' }, 400);
        store.name = storeName;
        await saveGroceryStores(env, stores);
        return json({ stores });
      }

      if (!itemId && request.method === 'DELETE') {
        const filtered = stores.filter(s => String(s.id) !== String(storeId));
        if (!filtered.length) return json({ error: 'Cannot delete the last store' }, 400);
        await saveGroceryStores(env, filtered);
        return json({ stores: filtered });
      }
    }

    // Legacy flat groceries (dashboard compatibility — all stores flattened)
    if (path === '/api/groceries') {
      const stores = await loadGroceryStores(env);
      if (request.method === 'GET') {
        return json(flattenGroceries(stores));
      }
      if (request.method === 'PUT') {
        const body = await readJson(request);
        if (!Array.isArray(body)) return json({ error: 'Expected array' }, 400);
        if (stores.length === 1) {
          stores[0].items = body;
        } else {
          return json({ error: 'Use /api/grocery-stores for multi-store updates' }, 400);
        }
        await saveGroceryStores(env, stores);
        return json(flattenGroceries(stores));
      }
      if (request.method === 'POST') {
        const body = await readJson(request);
        const itemText = body?.text?.trim();
        if (!itemText) return json({ error: 'Missing text' }, 400);
        stores[0].items.push({ id: Date.now(), text: itemText, done: false });
        await saveGroceryStores(env, stores);
        return json(flattenGroceries(stores));
      }
    }

    if (path.startsWith('/api/groceries/') && request.method === 'PATCH') {
      const id = path.split('/').pop();
      const body = await readJson(request);
      const stores = await loadGroceryStores(env);
      for (const store of stores) {
        const item = (store.items || []).find(g => String(g.id) === id);
        if (item) {
          if (typeof body?.done === 'boolean') item.done = body.done;
          if (typeof body?.text === 'string') item.text = body.text.trim();
          await saveGroceryStores(env, stores);
          return json(flattenGroceries(stores));
        }
      }
      return json({ error: 'Not found' }, 404);
    }

    if (path.startsWith('/api/groceries/') && request.method === 'DELETE') {
      const id = path.split('/').pop();
      const stores = await loadGroceryStores(env);
      let found = false;
      for (const store of stores) {
        const before = store.items.length;
        store.items = (store.items || []).filter(g => String(g.id) !== id);
        if (store.items.length !== before) found = true;
      }
      if (!found) return json({ error: 'Not found' }, 404);
      await saveGroceryStores(env, stores);
      return json(flattenGroceries(stores));
    }

    if (path === '/api/favorites') {
      if (request.method === 'GET') {
        return json(await kvGet(env, 'favorites', []));
      }
      if (request.method === 'PUT' || request.method === 'POST') {
        const body = await readJson(request);
        if (!Array.isArray(body)) return json({ error: 'Expected array' }, 400);
        const existing = await kvGet(env, 'favorites', []);
        const merged = mergeFavoritesById(
          Array.isArray(existing) ? existing : [],
          body,
        );
        await kvPut(env, 'favorites', merged);
        return json({ ok: true, count: merged.length });
      }
    }

    if (path === '/api/settings') {
      if (request.method === 'GET') {
        return json(await kvGet(env, 'settings', {}));
      }
      if (request.method === 'PUT') {
        const body = await readJson(request);
        if (!body || typeof body !== 'object') return json({ error: 'Expected object' }, 400);
        await kvPut(env, 'settings', body);
        return json({ ok: true });
      }
    }

    return text('Not found', 404);
  },
};
