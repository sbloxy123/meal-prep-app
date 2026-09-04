// Run with `npm test` (node --test). Vendored with the ingredient_aisles seed
// (lib/ingredients/) — the normaliser is what makes the cache hit; every case
// here is a line a real recipe produced.
'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const { normaliseIngredient, resolveAisles } = require('../lib/ingredients/normalise');

const key = (s) => normaliseIngredient(s).key;

test('strips quantities and units', () => {
  assert.strictEqual(key('2 large free-range eggs, beaten'), 'egg');
  assert.strictEqual(key('400g chopped tomatoes'), 'chopped tomatoes');
  assert.strictEqual(key('250ml double cream'), 'double cream');
  assert.strictEqual(key('2 x 400g tins of chopped tomatoes'), 'chopped tomatoes');
  assert.strictEqual(key('1 1/2 tbsp olive oil'), 'olive oil');
  assert.strictEqual(key('½ tsp ground cumin'), 'ground cumin');
});

test('collapses chicken breast variants', () => {
  const variants = [
    'chicken breast',
    'chicken breasts',
    '2 chicken breasts, diced',
    '4 skinless boneless chicken breasts',
    '600g chicken breast, cut into strips',
  ];
  for (const v of variants) {
    assert.strictEqual(key(v), 'chicken breast', `failed on: ${v}`);
  }
});

test('preserves aisle-changing modifiers', () => {
  assert.strictEqual(key('a handful of fresh coriander'), 'fresh coriander');
  assert.strictEqual(key('1 tsp dried oregano'), 'dried oregano');
  assert.strictEqual(key('200g smoked salmon'), 'smoked salmon');
  assert.strictEqual(key('300g frozen peas'), 'frozen pea');
});

test('handles freshly ground black pepper without losing "pepper"', () => {
  assert.strictEqual(key('freshly ground black pepper'), 'black pepper');
  // compound lines must be split first — that's splitCompoundLine's job
  const parts = require('../lib/ingredients/normalise').splitCompoundLine('salt and black pepper');
  assert.deepStrictEqual(parts.map(key), ['salt', 'black pepper']);
});

test('drops prep instructions after commas', () => {
  assert.strictEqual(key('1 onion, finely chopped'), 'onion');
  assert.strictEqual(key('100g cheddar, grated'), 'cheddar');
  assert.strictEqual(key('3 garlic cloves, crushed'), 'garlic');
});

test('applies regional synonyms', () => {
  assert.strictEqual(key('1 large eggplant'), 'aubergine');
  assert.strictEqual(key('2 zucchini'), 'courgette');
  assert.strictEqual(key('500g ground beef'), 'beef mince');
  assert.strictEqual(key('a bunch of cilantro'), 'fresh coriander');
  assert.strictEqual(key('200g garbanzo beans'), 'chickpea');
});

test('singularises correctly', () => {
  assert.strictEqual(key('potatoes'), 'potato');
  assert.strictEqual(key('anchovies'), 'anchovy');
  assert.strictEqual(key('bay leaves'), 'bay leaf');
  assert.strictEqual(key('hummus'), 'hummus');
  assert.strictEqual(key('asparagus'), 'asparagus');
  assert.strictEqual(key('couscous'), 'couscous');
});

test('strips trailing serving instructions', () => {
  assert.strictEqual(key('olive oil, for frying'), 'olive oil');
  assert.strictEqual(key('parmesan, to serve'), 'parmesan');
  assert.strictEqual(key('100g butter plus extra for greasing'), 'butter');
});

test('builds a backoff chain', () => {
  const r = normaliseIngredient('organic British free-range large chicken thighs');
  assert.ok(r.candidates.includes('chicken thigh'));
  assert.ok(r.candidates.includes('thigh'));
});

test('flags ambiguous heads', () => {
  assert.strictEqual(normaliseIngredient('black pepper').ambiguous, true);
  assert.strictEqual(normaliseIngredient('onion').ambiguous, false);
});

test('returns null for unusable input', () => {
  assert.strictEqual(key(''), null);
  assert.strictEqual(key('   '), null);
  assert.strictEqual(key('2 tbsp'), null);
});

test('resolveAisles uses backoff but refuses ambiguous guesses', async () => {
  const cache = new Map([
    ['chicken breast', 'meat-poultry'],
    ['onion', 'fruit-veg'],
    ['black pepper', 'herbs-spices'],
  ]);
  const lookup = async (keys) =>
    new Map(keys.filter((k) => cache.has(k)).map((k) => [k, cache.get(k)]));

  const { resolved, misses } = await resolveAisles(
    ['2 chicken breasts, diced', '1 red onion', 'freshly ground black pepper', 'gochujang'],
    lookup
  );

  const byRaw = Object.fromEntries(resolved.map((r) => [r.raw, r.aisle]));
  assert.strictEqual(byRaw['2 chicken breasts, diced'], 'meat-poultry');
  assert.strictEqual(byRaw['1 red onion'], 'fruit-veg');       // backoff red onion → onion
  assert.strictEqual(byRaw['freshly ground black pepper'], 'herbs-spices');
  assert.strictEqual(misses.length, 1);
  assert.strictEqual(misses[0].key, 'gochujang');
});

test('ambiguous backoff is refused', async () => {
  const cache = new Map([['pepper', 'fruit-veg']]);
  const lookup = async (keys) =>
    new Map(keys.filter((k) => cache.has(k)).map((k) => [k, cache.get(k)]));

  // "white pepper" is not seeded; it must NOT silently back off to the
  // produce-aisle "pepper".
  const { resolved, misses } = await resolveAisles(['1 tsp white pepper'], lookup);
  assert.strictEqual(resolved.length, 0);
  assert.strictEqual(misses.length, 1);
});
