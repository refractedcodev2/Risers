import { getStore } from '@netlify/blobs';

// Runs every 10 minutes. Finds games, saves their details and player counts, keeps 24h of history.
const TERMS = ['simulator', 'tycoon', 'obby', 'horror', 'anime', 'tower defense', 'rng', 'modded', 'racing', 'survival', 'roleplay', 'fighting'];
const KEEP = 144, MAX_POOL = 600, PAGES = 3;
const SESSION = crypto.randomUUID();

const j = async url => {
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (risers)' }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(r.status + ' ' + url);
  return r.json();
};
const collect = (o, out) => {
  (function w(x) { if (x && typeof x === 'object') { if (x.universeId) out.add(Number(x.universeId)); Object.values(x).forEach(w); } })(o);
};
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export default async () => {
  const store = getStore('risers');
  const st = (await store.get('state', { type: 'json' })) || {};
  const prev = { ts: st.ts || [], d: st.d || {}, games: st.games || {}, icons: st.icons || {} };

  // 1. Find games: Roblox discovery lists plus keyword searches
  const found = new Set(Object.keys(prev.games).map(Number));
  const q = `sessionId=${SESSION}&device=computer&country=all`;
  try {
    const s = await j(`https://apis.roblox.com/explore-api/v1/get-sorts?${q}`);
    const sorts = (s.sorts || []).filter(x => !x.contentType || /game/i.test(x.contentType)).slice(0, 14);
    await Promise.all([
      ...sorts.map(async so => {
        let tok = '';
        for (let p = 0; p < PAGES; p++) {
          try {
            const c = await j(`https://apis.roblox.com/explore-api/v1/get-sort-content?${q}&sortId=${encodeURIComponent(so.sortId ?? so.id)}${tok}`);
            collect(c, found);
            if (!c.nextPageToken) break;
            tok = '&pageToken=' + encodeURIComponent(c.nextPageToken);
          } catch { break; }
        }
      }),
      ...TERMS.map(t => j(`https://apis.roblox.com/search-api/omni-search?searchQuery=${encodeURIComponent(t)}&sessionId=${SESSION}`).then(o => collect(o, found)).catch(() => {}))
    ]);
  } catch {}

  // 2. Current details for every game
  const fresh = new Map();
  await Promise.all(chunks([...found], 50).map(async ids => {
    try {
      const d = await j(`https://games.roblox.com/v1/games?universeIds=${ids.join(',')}`);
      d.data.forEach(g => fresh.set(g.id, {
        id: g.id, rootPlaceId: g.rootPlaceId, name: g.name, playing: g.playing, visits: g.visits,
        created: g.created, updated: g.updated, favoritedCount: g.favoritedCount,
        creator: { id: g.creator?.id, name: g.creator?.name, type: g.creator?.type }
      }));
    } catch {}
  }));

  // 3. Keep the newest games if the pool is too big
  let ids = [...new Set([...fresh.keys(), ...Object.keys(prev.games).map(Number)])];
  const info = id => fresh.get(id) || prev.games[id];
  if (ids.length > MAX_POOL) ids = ids.filter(info).sort((a, b) => Date.parse(info(b).created) - Date.parse(info(a).created)).slice(0, MAX_POOL);

  // 4. Append this snapshot
  const n = prev.ts.length, ts = [...prev.ts, Date.now()], d = {}, games = {};
  for (const id of ids) {
    const g = info(id);
    if (!g) continue;
    const arr = prev.d[id] ? [...prev.d[id]] : new Array(n).fill(null);
    arr.push(fresh.has(id) ? fresh.get(id).playing : null);
    if (arr.length >= 12 && arr.slice(-12).every(v => v == null)) continue;   // gone for 2 hours
    d[id] = arr; games[id] = g;
  }
  const cut = Math.max(0, ts.length - KEEP);
  const out = { ts: ts.slice(cut), d: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.slice(cut)])), games, icons: {} };

  // 5. Icons for games that don't have one yet
  const icons = { ...prev.icons };
  await Promise.all(chunks(Object.keys(games).filter(id => !icons[id]), 100).map(async c => {
    try {
      const t = await j(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${c.join(',')}&returnPolicy=PlaceHolder&size=256x256&format=Png&isCircular=false`);
      t.data.forEach(x => { if (x.imageUrl) icons[x.targetId] = x.imageUrl; });
    } catch {}
  }));
  Object.keys(games).forEach(id => { if (icons[id]) out.icons[id] = icons[id]; });

  await store.setJSON('state', out);
};

export const config = { schedule: '*/10 * * * *' };

