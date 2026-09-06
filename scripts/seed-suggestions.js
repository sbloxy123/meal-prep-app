// Seed suggestion_pool with the generated pools (lib/suggestions/suggestion-seed.js,
// built once by scripts/build-suggestion-seed.js). Idempotent — runs on every
// Railway start (railway.toml) after migrate:up: pools that already exist are
// left alone (they grow from real use and must not be reset by a redeploy),
// missing ones are added. Exits 0 even when the table or the seed file is
// missing so an old database can still boot.
require("dotenv").config();
const pool = require("../db/pool");

(async () => {
    let seed = [];
    try {
        seed = require("../lib/suggestions/suggestion-seed").SUGGESTION_SEED;
    } catch {
        console.log("[suggestions] no seed file — skipped");
        await pool.end();
        return;
    }
    const rows = seed.filter((r) => r && r.key && Array.isArray(r.ideas) && r.ideas.length > 0);
    try {
        const { rowCount } = await pool.query(
            `INSERT INTO suggestion_pool (key, hint, diets, ideas, source)
             SELECT k, h, d, i::jsonb, 'seed'
             FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS t(k, h, d, i)
             ON CONFLICT (key, diets) DO NOTHING`,
            [rows.map((r) => r.key), rows.map((r) => r.hint ?? ""), rows.map((r) => r.diets ?? ""), rows.map((r) => JSON.stringify(r.ideas))],
        );
        console.log(`[suggestions] seed: ${rows.length} pools, ${rowCount} new`);
    } catch (error) {
        console.error("[suggestions] seed skipped:", error.message);
    } finally {
        await pool.end();
    }
})();
