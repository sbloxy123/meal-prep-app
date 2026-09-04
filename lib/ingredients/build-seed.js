'use strict';

const fs = require('node:fs');
const source = require('./seed-source');
const { normaliseIngredient } = require('./normalise');

const rows = [];
const seen = new Map();
const problems = [];

for (const [aisle, labels] of Object.entries(source)) {
  for (const label of labels) {
    const { key } = normaliseIngredient(label);

    if (!key) { problems.push(`NO KEY: "${label}" (${aisle})`); continue; }

    // Idempotency: normalising the generated key must give the same key back,
    // or lookups at runtime will never match the seed.
    const round = normaliseIngredient(key).key;
    if (round !== key) problems.push(`NOT IDEMPOTENT: "${label}" -> "${key}" -> "${round}"`);

    if (seen.has(key)) {
      if (seen.get(key) !== aisle) {
        problems.push(`COLLISION: "${key}" in both ${seen.get(key)} and ${aisle} (from "${label}")`);
      }
      continue;
    }
    seen.set(key, aisle);
    rows.push({ key, label, aisle });
  }
}

console.log(`Rows: ${rows.length}`);
console.log(`Aisles: ${Object.keys(source).length}`);
if (problems.length) {
  console.log(`\nProblems (${problems.length}):`);
  problems.forEach((p) => console.log('  ' + p));
} else {
  console.log('No problems.');
}

const banner = `'use strict';

/**
 * ingredient_aisles seed — ${rows.length} common UK grocery items.
 *
 * GENERATED FILE. Edit seed-source.js and re-run build-seed.js.
 *
 *   key    – normalised lookup key. Must match normaliseIngredient() output.
 *   label  – human-readable name for the admin review screen.
 *   aisle  – coarse aisle bucket (see AISLES below).
 *
 * All rows seed as region 'UK', source 'seed', confidence 1.0.
 * Model-generated rows added at runtime should use source 'model' and a
 * lower confidence so they can be filtered for human review.
 */

const AISLES = ${JSON.stringify(Object.keys(source), null, 2).replace(/\n/g, '\n')};

const INGREDIENT_AISLE_SEED = `;

const body = JSON.stringify(rows, null, 2);
const footer = `;

module.exports = { INGREDIENT_AISLE_SEED, AISLES };
`;

fs.writeFileSync(require('node:path').join(__dirname, 'ingredient-aisles.seed.js'), banner + body + footer);
console.log('\nWrote ingredient-aisles.seed.js');
