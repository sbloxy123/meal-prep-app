const fs = require("node:fs");
const path = require("node:path");
const pool = require("./pool");

async function initializeDatabase() {
    const sqlPath = path.join(__dirname, "init.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    // Strip psql meta-commands (\restrict, \unrestrict, etc.), comment-only
    // lines, and blank lines that the pg driver cannot parse, then split on
    // statement-ending semicolons to get individual executable statements.
    const statements = sql
        .split("\n")
        .filter((line) => {
            const trimmed = line.trimStart();
            return (
                !trimmed.startsWith("\\") && // psql meta-commands
                !trimmed.startsWith("--") && // SQL comments
                trimmed.length > 0           // blank lines
            );
        })
        .join("\n")
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        for (const statement of statements) {
            await client.query(statement);
        }
        await client.query("COMMIT");
        console.log("Database initialized successfully.");
    } catch (error) {
        await client.query("ROLLBACK");
        // 42P07 = duplicate_table, 42710 = duplicate_object.
        // Only these codes mean the schema already exists — do NOT swallow
        // broader 42xxx codes (e.g. 42601 syntax error) which indicate a
        // real problem with the SQL that must be surfaced and fixed.
        if (error.code === "42P07" || error.code === "42710") {
            console.log("Database schema already exists, skipping initialization.");
        } else {
            console.error(
                "Database initialization failed [%s]: %s",
                error.code ?? "unknown",
                error.message
            );
            throw error;
        }
    } finally {
        client.release();
    }
}

module.exports = initializeDatabase;
