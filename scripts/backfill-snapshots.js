// One-off: write every missing daily snapshot for the last N days (default 90).
//   node scripts/backfill-snapshots.js [days]
// Older days get exact flows and today's values for the stock figures that
// can't be reconstructed (flagged in metrics.reconstructed).
require("dotenv").config();
const pool = require("../db/pool");
const { writeMissingSnapshots } = require("../lib/snapshots");

const days = Number.parseInt(process.argv[2] ?? "90", 10);
writeMissingSnapshots({ lookback: days })
    .then((r) => console.log(`[snapshots] backfill ${days}d:`, r))
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => pool.end());
