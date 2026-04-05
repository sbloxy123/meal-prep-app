const fs = require("node:fs");
const path = require("node:path");
const pool = require("./pool");

async function initializeDatabase() {
    const sqlPath = path.join(__dirname, "init.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    // Strip psql meta-commands (\restrict, \unrestrict, etc.) that the pg
    // driver cannot execute, then collect only the standard SQL statements.
    const statements = sql
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("\\"))
        .join("\n")
        // Split on statement-ending semicolons and drop empty entries.
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
        // 42P07 = duplicate_table, 42710 = duplicate_object — schema already exists.
        if (error.code && error.code.startsWith("42")) {
            console.log("Database schema already exists, skipping initialization.");
        } else {
            console.error("Database initialization failed:", error.message);
            throw error;
        }
    } finally {
        client.release();
    }
}

module.exports = initializeDatabase;
