/* ---------------------------------------------------------------
   STORAGE
   The original app ran inside a Claude artifact and used window.storage,
   which only exists there. Outside it we need a real backend, and which one
   depends on whether the bote is shared:

   - No env vars  -> localStorage. Works offline, zero setup, but the data
     lives in one browser: each person who opens the link sees their own bote.
   - VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY -> Supabase REST. Everyone
     who opens the link reads and writes the same rows, which is what the
     app was originally doing with shared=true. See README for the table.

   Same three async functions either way, so App.jsx doesn't care.
----------------------------------------------------------------*/

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isShared = Boolean(SUPABASE_URL && SUPABASE_KEY);

/* --- localStorage backend ------------------------------------- */

const LS_PREFIX = "bote:";

const local = {
  async get(key) {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  },
  async set(key, value) {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  },
  async delete(key) {
    localStorage.removeItem(LS_PREFIX + key);
  },
};

/* --- Supabase backend (plain REST, no SDK dependency) ---------- */

const TABLE = "kv";

function sbHeaders(extra) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

const supabase = {
  async get(key) {
    const url = `${SUPABASE_URL}/rest/v1/${TABLE}?key=eq.${encodeURIComponent(key)}&select=value`;
    const r = await fetch(url, { headers: sbHeaders() });
    if (!r.ok) throw new Error(`Supabase GET ${r.status}`);
    const rows = await r.json();
    return rows.length ? rows[0].value : null;
  },
  async set(key, value) {
    // merge-duplicates makes this an upsert on the primary key.
    const url = `${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=key`;
    const r = await fetch(url, {
      method: "POST",
      headers: sbHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ key, value }),
    });
    if (!r.ok) throw new Error(`Supabase POST ${r.status}`);
  },
  async delete(key) {
    const url = `${SUPABASE_URL}/rest/v1/${TABLE}?key=eq.${encodeURIComponent(key)}`;
    const r = await fetch(url, { method: "DELETE", headers: sbHeaders() });
    if (!r.ok) throw new Error(`Supabase DELETE ${r.status}`);
  },
};

const backend = isShared ? supabase : local;

/* --- public API ------------------------------------------------ */
// Failures stay silent the way the original helpers did: the UI already
// surfaces an empty/partial load via its own storageError banner.

export async function storeGet(key) {
  try {
    return await backend.get(key);
  } catch (e) {
    return null;
  }
}

export async function storeSet(key, value) {
  try {
    await backend.set(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

export async function storeDelete(key) {
  try {
    await backend.delete(key);
    return true;
  } catch (e) {
    return false;
  }
}
