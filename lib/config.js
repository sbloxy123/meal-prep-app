// app_config — the knobs that change without a deploy (migration 016).
//
//   const cfg = await getConfig();          // { trial_days, free_credit_allowance, … }
//   await setConfig("trial_days", 21, by);  // validated, logged, cache dropped
//
// Read on every entitlement check, so it is cached in-process for a short
// while; a write invalidates it here, and any other instance catches up within
// CACHE_TTL_MS. Values are JSON; the defaults below are what the app assumes
// when a row is missing (they match the seed rows in the migration).

const pool = require("../db/pool");

const DEFAULTS = {
    trial_days: 14,
    free_credit_allowance: 50,
    premium_credit_allowance: 300,
    credit_weights: {
        import: 1,
        estimate: 1,
        improve: 1,
        generate: 1,
        suggest: 1,
        photo: 3,
        social: 1,
        aisle: 0,
        parse: 0,
        usuals: 0,
    },
    member_limit_free: 2,
    founders_coupon: null,
    founders_cap: 200,
};

const CACHE_TTL_MS = 30_000;

// What each key accepts. PUT /admin/config rejects anything else.
const VALIDATORS = {
    trial_days: (v) => Number.isInteger(v) && v >= 0 && v <= 365,
    free_credit_allowance: (v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 100_000),
    premium_credit_allowance: (v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 100_000),
    credit_weights: (v) =>
        v !== null &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        Object.entries(v).every(
            ([k, w]) => /^[a-z_]{1,32}$/.test(k) && Number.isInteger(w) && w >= 0 && w <= 100,
        ),
    member_limit_free: (v) => Number.isInteger(v) && v >= 1 && v <= 50,
    founders_coupon: (v) => v === null || (typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v)),
    founders_cap: (v) => Number.isInteger(v) && v >= 0 && v <= 100_000,
};

let cache = null;
let cacheAt = 0;

async function loadConfig() {
    const { rows } = await pool.query("SELECT key, value, updated_at, updated_by FROM app_config");
    const cfg = { ...DEFAULTS };
    const meta = {};
    for (const r of rows) {
        if (r.key in DEFAULTS) cfg[r.key] = r.value;
        meta[r.key] = { updatedAt: r.updated_at, updatedBy: r.updated_by };
    }
    return { cfg, meta };
}

async function getConfig() {
    if (cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache.cfg;
    try {
        cache = await loadConfig();
        cacheAt = Date.now();
        return cache.cfg;
    } catch (error) {
        // A config read must never take an AI call down with it.
        console.error("[config] load failed, using defaults:", error.message);
        return cache?.cfg ?? { ...DEFAULTS };
    }
}

// Uncached, with per-key audit fields — for the admin panel.
async function getConfigWithMeta() {
    const loaded = await loadConfig();
    cache = loaded;
    cacheAt = Date.now();
    return loaded;
}

async function setConfig(key, value, updatedBy = null) {
    if (!(key in VALIDATORS)) {
        const err = new Error(`Unknown config key: ${key}`);
        err.status = 400;
        throw err;
    }
    if (!VALIDATORS[key](value)) {
        const err = new Error(`Invalid value for ${key}`);
        err.status = 400;
        throw err;
    }
    await pool.query(
        `INSERT INTO app_config (key, value, updated_at, updated_by)
         VALUES ($1, $2, now(), $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [key, JSON.stringify(value), updatedBy],
    );
    invalidateConfig();
}

function invalidateConfig() {
    cache = null;
    cacheAt = 0;
}

module.exports = { DEFAULTS, VALIDATORS, getConfig, getConfigWithMeta, setConfig, invalidateConfig };
