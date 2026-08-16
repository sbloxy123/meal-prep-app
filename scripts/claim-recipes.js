// One-off script: assign all unclaimed rows to Stuart's account.
// Safe to run repeatedly — only touches rows where user_id IS NULL.
const { Pool } = require("pg");

const USER_ID = "7noGqrqZ1bTVGuNXjZWDs2SPxSCe0hMO";

async function main() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    const r = await pool.query(
        'UPDATE recipes SET user_id = $1 WHERE user_id IS NULL',
        [USER_ID],
    );
    const s = await pool.query(
        'UPDATE shopping_list SET user_id = $1 WHERE user_id IS NULL',
        [USER_ID],
    );
    const g = await pool.query(
        'UPDATE generated_shopping_list SET user_id = $1 WHERE user_id IS NULL',
        [USER_ID],
    );

    console.log(`[claim-recipes] recipes: ${r.rowCount}, shopping_list: ${s.rowCount}, generated_shopping_list: ${g.rowCount}`);
    await pool.end();
}

main().catch((err) => {
    console.error("[claim-recipes] failed:", err.message);
    process.exit(1);
});
