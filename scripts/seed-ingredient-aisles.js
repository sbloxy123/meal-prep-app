// Seed ingredient_aisles with the curated UK grocery list. Idempotent — runs
// on every Railway start (railway.toml) after migrate:up: existing keys are
// left alone (a human correction must never be overwritten by a redeploy),
// new seed rows are added. Exits 0 even when the table is missing so an old
// database can still boot; the migration creates it on the next start.
require("dotenv").config();
const pool = require("../db/pool");
const { INGREDIENT_AISLE_SEED } = require("../lib/ingredients/ingredient-aisles.seed");
const { isSlug } = require("../lib/ingredients/aisles");

(async () => {
    const rows = INGREDIENT_AISLE_SEED.filter((r) => isSlug(r.aisle));
    if (rows.length !== INGREDIENT_AISLE_SEED.length) {
        console.error(`[aisles] ${INGREDIENT_AISLE_SEED.length - rows.length} seed rows have an unknown aisle — skipped`);
    }
    try {
        const keys = rows.map((r) => r.key);
        const labels = rows.map((r) => r.label);
        const aisles = rows.map((r) => r.aisle);
        const { rowCount } = await pool.query(
            `INSERT INTO ingredient_aisles (key, label, aisle, region, source, confidence)
             SELECT k, l, a, 'UK', 'seed', 1.0
             FROM unnest($1::text[], $2::text[], $3::text[]) AS t(k, l, a)
             ON CONFLICT (key, region) DO NOTHING`,
            [keys, labels, aisles],
        );
        console.log(`[aisles] seed: ${rows.length} rows, ${rowCount} new`);
    } catch (error) {
        console.error("[aisles] seed skipped:", error.message);
    } finally {
        await pool.end();
    }
})();
