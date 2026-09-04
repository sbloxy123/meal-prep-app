'use strict';

/**
 * Ingredient normalisation.
 *
 * Turns a free-text ingredient line ("2 large free-range eggs, beaten")
 * into a stable lookup key ("egg") plus a backoff chain of progressively
 * less specific candidates to try against the ingredient_aisles cache.
 *
 * Design notes:
 *  - "fresh", "dried", "smoked", "frozen", "tinned" are PRESERVED because
 *    they change the aisle (fresh basil = produce, dried basil = spices).
 *  - Colour/size adjectives are preserved in the primary key but stripped
 *    by the backoff chain, so "red pepper" hits directly if seeded and
 *    falls back to "pepper" if not.
 *  - AMBIGUOUS_HEADS guards the backoff: we never *guess* an aisle from a
 *    head noun whose aisle depends entirely on its modifier.
 */

// ---------------------------------------------------------------------------
// Lookup tables
// ---------------------------------------------------------------------------

const UNICODE_FRACTIONS = /[½¼¾⅓⅔⅛⅜⅝⅞]/g;

// Measurement words. Stripped wherever they appear.
const UNIT_WORDS = new Set([
  'g', 'gram', 'grams', 'gramme', 'grammes',
  'kg', 'kilo', 'kilos', 'kilogram', 'kilograms',
  'mg', 'ml', 'millilitre', 'millilitres', 'l', 'litre', 'litres',
  'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
  'tsp', 'teaspoon', 'teaspoons', 'tbsp', 'tablespoon', 'tablespoons',
  'dsp', 'dessertspoon', 'dessertspoons',
  'cup', 'cups', 'pint', 'pints', 'quart', 'quarts', 'gallon',
  'fl', 'floz',
  'pinch', 'pinches', 'dash', 'dashes', 'drop', 'drops', 'splash',
  'handful', 'handfuls', 'knob', 'knobs', 'glug', 'squeeze', 'sprinkle',
  'clove', 'cloves', 'sprig', 'sprigs', 'stalk', 'stalks', 'stick', 'sticks',
  'bunch', 'bunches', 'head', 'heads', 'slice', 'slices', 'rasher', 'rashers',
  'fillet', 'fillets', 'piece', 'pieces', 'portion', 'portions',
  'can', 'cans', 'tin', 'tins', 'jar', 'jars', 'packet', 'packets',
  'pack', 'packs', 'pot', 'pots', 'tub', 'tubs', 'bag', 'bags',
  'box', 'boxes', 'carton', 'cartons', 'bottle', 'bottles', 'sachet', 'sachets',
  'punnet', 'punnets', 'block', 'blocks', 'ball', 'balls',
]);

// NOTE: 'fillet' and 'stick' are units here, but "chicken fillet" backs off
// to "chicken" which is correctly seeded, so no aisle is lost.

// Preparation verbs / adverbs. Stripped wherever they appear.
const PREP_WORDS = new Set([
  'chopped', 'diced', 'sliced', 'minced', 'crushed', 'grated', 'zested',
  'peeled', 'cored', 'seeded', 'deseeded', 'destoned', 'pitted', 'stoned',
  'halved', 'quartered', 'cubed', 'shredded', 'torn', 'trimmed', 'topped',
  'tailed', 'rinsed', 'washed', 'drained', 'strained', 'squeezed', 'juiced',
  'beaten', 'whisked', 'melted', 'softened', 'chilled', 'warmed', 'cooled',
  'mashed', 'pureed', 'blended', 'shelled', 'podded', 'scrubbed', 'scored',
  'roughly', 'finely', 'thinly', 'coarsely', 'lightly', 'thickly', 'evenly',
  'freshly', 'well', 'nicely', 'approximately', 'about', 'roughly',
  'optional', 'plus', 'extra', 'level', 'heaped', 'heaping', 'generous',
  'room', 'temperature', 'cold', 'warm', 'hot', 'lukewarm',
]);

// Size / quality adjectives that never change the aisle.
const FILLER_WORDS = new Set([
  'a', 'an', 'the', 'of', 'or', 'and', 'to', 'for', 'with', 'into', 'as',
  'some', 'few', 'x', 'approx',
  'large', 'medium', 'small', 'big', 'tiny', 'jumbo', 'baby',
  'organic', 'unwaxed', 'ripe', 'good', 'best', 'quality', 'premium',
  'value', 'british', 'scottish', 'welsh', 'irish', 'local', 'seasonal',
  'skinless', 'boneless', 'trimmed', 'lean', 'raw', 'uncooked',
  'your', 'own', 'preferred', 'favourite', 'favorite', 'any',
]);

// NOTE: 'baby' is filler — "baby spinach" → "spinach" (same aisle).

// Multi-word phrases removed before tokenising. Order matters.
const PHRASE_STRIPS = [
  /\bfreshly ground\b/g,          // so "black pepper" survives, "ground cumin" doesn't lose "ground"
  /\bfree[\s-]range\b/g,
  /\bskin[\s-]on\b/g,
  /\bbone[\s-]in\b/g,
  /\bat room temperature\b/g,
  /\bplus extra\b[\s\S]*$/g,
  /\bto taste\b[\s\S]*$/g,
  /\bto serve\b[\s\S]*$/g,
  /\bto garnish\b[\s\S]*$/g,
  /\bto finish\b[\s\S]*$/g,
  /\bfor (frying|greasing|dusting|drizzling|brushing|the pan|coating|deep[\s-]frying)\b[\s\S]*$/g,
  /\bif (using|needed|desired|preferred)\b[\s\S]*$/g,
  /\bor more\b[\s\S]*$/g,
  /\bcut into\b[\s\S]*$/g,
  /\btorn into\b[\s\S]*$/g,
  /\bbroken into\b[\s\S]*$/g,
];

// Irregular plurals we can't handle with suffix rules.
const IRREGULAR_PLURALS = {
  leaves: 'leaf', loaves: 'loaf', knives: 'knife', halves: 'half',
  wolves: 'wolf', shelves: 'shelf', calves: 'calf',
  geese: 'goose', teeth: 'tooth', feet: 'foot', mice: 'mouse',
  children: 'child', people: 'person',
  potatoes: 'potato', tomatoes: 'tomato', mangoes: 'mango',
  avocadoes: 'avocado', volcanoes: 'volcano',
  chillies: 'chilli', anchovies: 'anchovy', berries: 'berry',
  roux: 'roux', gnocchi: 'gnocchi', ravioli: 'ravioli',
  spaghetti: 'spaghetti', linguine: 'linguine', penne: 'penne',
  tagliatelle: 'tagliatelle', fusilli: 'fusilli', rigatoni: 'rigatoni',
  farfalle: 'farfalle', conchiglie: 'conchiglie', orzo: 'orzo',
  macaroni: 'macaroni', cannelloni: 'cannelloni', vermicelli: 'vermicelli',
  biscotti: 'biscotti', panini: 'panini',
};

// Words ending in s/us/is/ss that must never be singularised.
const NEVER_SINGULARISE = new Set([
  'hummus', 'asparagus', 'couscous', 'molasses', 'watercress', 'cress',
  'swiss', 'bass', 'seabass', 'plaice', 'pastis', 'anise', 'chorizo',
  'harissa', 'salsa', 'quinoa', 'polenta', 'passata', 'ricotta',
  'focaccia', 'ciabatta', 'mozzarella', 'pancetta', 'bruschetta',
  'gas', 'juice', 'sauce', 'rice', 'lettuce', 'cheese', 'grease',
  'mousse', 'goose', 'moose', 'treacle', 'apples',
]);
NEVER_SINGULARISE.delete('apples'); // guard against typos in the set above

// Synonyms → canonical key. Applied after singularisation.
// Keep this list growing as the admin review surfaces near-duplicates.
const SYNONYMS = {
  // regional
  eggplant: 'aubergine',
  zucchini: 'courgette',
  cilantro: 'fresh coriander',
  'coriander leaf': 'fresh coriander',
  'coriander leaves': 'fresh coriander',
  arugula: 'rocket',
  scallion: 'spring onion',
  'green onion': 'spring onion',
  'garbanzo bean': 'chickpea',
  'garbanzo': 'chickpea',
  'bell pepper': 'pepper',
  'capsicum': 'pepper',
  'confectioners sugar': 'icing sugar',
  'powdered sugar': 'icing sugar',
  'superfine sugar': 'caster sugar',
  'all purpose flour': 'plain flour',
  'all-purpose flour': 'plain flour',
  'heavy cream': 'double cream',
  'light cream': 'single cream',
  'half and half': 'single cream',
  'baking soda': 'bicarbonate of soda',
  'corn starch': 'cornflour',
  cornstarch: 'cornflour',
  'ground beef': 'beef mince',
  'minced beef': 'beef mince',
  'ground pork': 'pork mince',
  'minced pork': 'pork mince',
  'ground lamb': 'lamb mince',
  'minced lamb': 'lamb mince',
  'ground chicken': 'chicken mince',
  'ground turkey': 'turkey mince',
  shrimp: 'prawn',
  'jumbo shrimp': 'king prawn',
  'chips': 'frozen chips',
  'french fries': 'frozen chips',
  'fries': 'frozen chips',
  'golden syrup': 'golden syrup',
  'granulated white sugar': 'granulated sugar',
  'white sugar': 'granulated sugar',
  'soda water': 'sparkling water',
  'club soda': 'sparkling water',
  'aubergine': 'aubergine',
  'spring greens': 'cabbage',
  'romaine': 'romaine lettuce',
  'cos lettuce': 'romaine lettuce',
  'swede': 'swede',
  'rutabaga': 'swede',
  'beet': 'beetroot',
  'beets': 'beetroot',
  'sweetcorn kernel': 'sweetcorn',
  'creme fraiche': 'creme fraiche',
  'crème fraîche': 'creme fraiche',
  'greek style yoghurt': 'greek yoghurt',
  yogurt: 'yoghurt',
  'greek yogurt': 'greek yoghurt',
  'natural yogurt': 'natural yoghurt',
  'plain yoghurt': 'natural yoghurt',
  'plain yogurt': 'natural yoghurt',
  'spring water': 'still water',
  'mineral water': 'still water',
  'tinned tomato': 'chopped tomatoes',
  'canned tomato': 'chopped tomatoes',
  'chopped tomato': 'chopped tomatoes',
  'plum tomato': 'plum tomatoes',
  'tomato passata': 'passata',
  'stock cube': 'vegetable stock cube',
  'bouillon cube': 'vegetable stock cube',
  'parmigiano reggiano': 'parmesan',
  'parmigiano': 'parmesan',
  'pecorino': 'parmesan',
  'aubergines': 'aubergine',
  'red chilli': 'chilli',
  'green chilli': 'chilli',
  'birds eye chilli': 'chilli',
  'scotch bonnet': 'chilli',
  'chile': 'chilli',
  'chili': 'chilli',
  'chili flake': 'chilli flakes',
  'chilli flake': 'chilli flakes',
  'red pepper flake': 'chilli flakes',
  'chili powder': 'chilli powder',
  'sea salt flake': 'sea salt',
  'flaky sea salt': 'sea salt',
  'kosher salt': 'sea salt',
  'table salt': 'salt',
  'olive oil spray': 'olive oil',
  'vegetable stock': 'vegetable stock cube',
  'chicken stock': 'chicken stock cube',
  'beef stock': 'beef stock cube',
  'soy': 'soy sauce',
  'tamari': 'soy sauce',
  'spring onion greens': 'spring onion',
  'unsalted butter': 'unsalted butter',
  'salted butter': 'butter',
  'egg white': 'egg',
  'egg yolk': 'egg',
  'whole egg': 'egg',
  'hen egg': 'egg',
  'wrap': 'tortilla wrap',
  'tortilla': 'tortilla wrap',
  'flour tortilla': 'tortilla wrap',
  'pitta': 'pitta bread',
  'pita': 'pitta bread',
  'pita bread': 'pitta bread',
  'naan': 'naan bread',
  'coriander powder': 'ground coriander',
  'cumin powder': 'ground cumin',
  'turmeric powder': 'turmeric',
  'ginger powder': 'ground ginger',
  'garlic clove': 'garlic',
  'garlic bulb': 'garlic',
  'onion white': 'onion',
  'brown onion': 'onion',
  'yellow onion': 'onion',
  'white onion': 'onion',
  'spaghetti pasta': 'spaghetti',
  'dried pasta': 'penne',
  'noodle': 'egg noodle',
};

// Real product names that would be destroyed by prep-word stripping.
// "400g chopped tomatoes" is a tin; "2 tomatoes, chopped" is produce.
// These are matched BEFORE tokenising and lock in the key.
// Keep this list short — only genuine collisions belong here.
const PROTECTED_PHRASES = [
  'chopped tomatoes', 'crushed tomatoes', 'plum tomatoes', 'sun dried tomato',
  'grated cheese', 'grated parmesan',
  'cooked ham', 'cooked chicken', 'sliced ham',
  'mashed potato', 'creamed horseradish', 'creamed coconut',
  'ground almond', 'ground rice', 'ground coriander', 'ground cumin',
  'ground ginger', 'ground cinnamon', 'ground nutmeg', 'ground turmeric',
  'ground white pepper', 'ground black pepper', 'ground clove',
  'crushed ice', 'shredded coconut', 'desiccated coconut',
  'condensed milk', 'evaporated milk', 'clotted cream', 'soured cream',
  'whipping cream', 'double cream', 'single cream',
  'smoked paprika', 'smoked salmon', 'smoked haddock', 'smoked mackerel',
  'roasted pepper', 'roasted red pepper', 'chopped walnut', 'chopped nut',
  'mixed herbs', 'mixed spice', 'mixed peel', 'dried mixed fruit',
  'baby spinach', 'baby potato', 'baby corn',
  'extra virgin olive oil',
];

// Head nouns whose aisle depends entirely on the modifier. If the backoff
// chain bottoms out here, return null and let the model decide.
const AMBIGUOUS_HEADS = new Set([
  'pepper', 'stock', 'sauce', 'paste', 'powder', 'seed', 'leaf', 'leaves',
  'extract', 'essence', 'mix', 'seasoning', 'dressing', 'spread', 'bar',
  'water', 'ice', 'roll', 'base', 'sheet', 'cube', 'flake', 'bean',
]);

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

function stripAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function singularise(word) {
  if (IRREGULAR_PLURALS[word]) return IRREGULAR_PLURALS[word];
  if (NEVER_SINGULARISE.has(word)) return word;
  if (word.length <= 3) return word;

  if (/[^aeiou]ies$/.test(word)) return word.slice(0, -3) + 'y';
  if (/(ch|sh|s|x|z)es$/.test(word)) return word.slice(0, -2);
  if (/oes$/.test(word)) return word.slice(0, -2);
  if (/(ss|us|is)$/.test(word)) return word;
  if (/s$/.test(word)) return word.slice(0, -1);
  return word;
}

function isQuantityToken(token) {
  if (/^\d+([.,]\d+)?$/.test(token)) return true;              // 2, 1.5
  if (/^\d+\/\d+$/.test(token)) return true;                    // 1/2
  if (/^\d+[-–—]\d+$/.test(token)) return true;                 // 2-3
  if (/^\d+([.,]\d+)?[a-z]{1,4}$/.test(token)) {                // 400g, 250ml, 2tbsp
    const suffix = token.replace(/^\d+([.,]\d+)?/, '');
    return UNIT_WORDS.has(suffix);
  }
  return false;
}

/**
 * @param {string} raw  A single ingredient line.
 * @returns {{ raw: string, key: string|null, candidates: string[], ambiguous: boolean }}
 *   key        – best-guess canonical key (most specific), or null if unusable
 *   candidates – ordered backoff chain, most specific first. Try each against
 *                the ingredient_aisles cache in order; first hit wins.
 *   ambiguous  – true if the chain bottoms out on an ambiguous head noun, in
 *                which case a cache miss should go to the model rather than
 *                being guessed.
 */
function normaliseIngredient(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { raw: raw ?? '', key: null, candidates: [], ambiguous: false };
  }

  let s = stripAccents(raw.toLowerCase());

  // Normalise punctuation
  s = s.replace(/[’‘`]/g, "'").replace(/[“”]/g, '"');
  s = s.replace(UNICODE_FRACTIONS, ' ');
  s = s.replace(/\([^)]*\)/g, ' ');        // drop parentheticals
  s = s.split(/[,;]/)[0];                   // drop everything after first comma
  s = s.replace(/[.!?"']/g, ' ');
  s = s.replace(/[-–—/]/g, ' ');

  for (const re of PHRASE_STRIPS) s = s.replace(re, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  // Protected phrases win outright — check the singularised string too, so
  // "chopped tomatoes" and "chopped tomato" both match.
  const singularised = s.split(' ').map(singularise).join(' ');
  for (const phrase of PROTECTED_PHRASES) {
    const singularPhrase = phrase.split(' ').map(singularise).join(' ');
    if (s.includes(phrase) || singularised.includes(singularPhrase)) {
      const canonical = SYNONYMS[phrase] || phrase;
      return { raw, key: canonical, candidates: [canonical], ambiguous: false };
    }
  }

  const tokens = s
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !isQuantityToken(t))
    .filter((t) => !UNIT_WORDS.has(t))
    .filter((t) => !PREP_WORDS.has(t))
    .filter((t) => !FILLER_WORDS.has(t))
    .map(singularise)
    .filter(Boolean);

  if (!tokens.length) {
    return { raw, key: null, candidates: [], ambiguous: false };
  }

  // Build backoff chain: full phrase, then drop leading tokens one at a time.
  const candidates = [];
  for (let i = 0; i < tokens.length; i++) {
    const phrase = tokens.slice(i).join(' ');
    const canonical = SYNONYMS[phrase] || phrase;
    if (!candidates.includes(canonical)) candidates.push(canonical);
  }

  // Also try dropping trailing tokens from the full phrase ("chicken breast
  // fillet" → "chicken breast"), which catches head-noun-last cases.
  for (let i = tokens.length - 1; i > 0; i--) {
    const phrase = tokens.slice(0, i).join(' ');
    const canonical = SYNONYMS[phrase] || phrase;
    if (!candidates.includes(canonical)) candidates.push(canonical);
  }

  const last = tokens[tokens.length - 1];
  const ambiguous = AMBIGUOUS_HEADS.has(last);

  return { raw, key: candidates[0], candidates, ambiguous };
}

/**
 * Split a line that names two ingredients ("salt and pepper", "oil and butter")
 * into separate lines. Run this BEFORE normaliseIngredient.
 *
 * Deliberately conservative: only splits on " and " when both halves are short
 * and neither contains a unit, so "chicken and mushroom pie" and
 * "1 tbsp oil and 2 onions, finely chopped" are left alone.
 */
function splitCompoundLine(raw) {
  if (typeof raw !== 'string') return [];
  const parts = raw.split(/\s+and\s+/i);
  if (parts.length !== 2) return [raw];

  const looksAtomic = parts.every((p) => {
    const words = p.trim().split(/\s+/);
    if (words.length > 3) return false;
    return !words.some((w) => UNIT_WORDS.has(w.toLowerCase()) || /\d/.test(w));
  });

  return looksAtomic ? parts.map((p) => p.trim()) : [raw];
}

/**
 * Resolve a batch of ingredient lines against a cache lookup function.
 *
 * @param {string[]} lines
 * @param {(keys: string[]) => Promise<Map<string,string>>} lookup
 *        Given normalised keys, returns Map<key, aisle> for those found.
 * @returns {Promise<{ resolved: Array, misses: Array }>}
 */
async function resolveAisles(lines, lookup) {
  const parsed = lines.map(normaliseIngredient);
  const allKeys = [...new Set(parsed.flatMap((p) => p.candidates))];
  const found = await lookup(allKeys);

  const resolved = [];
  const misses = [];

  for (const p of parsed) {
    if (!p.key) { misses.push(p); continue; }

    let hit = null;
    for (let i = 0; i < p.candidates.length; i++) {
      const aisle = found.get(p.candidates[i]);
      if (aisle) {
        // Refuse a backoff match only if we've fallen all the way to a bare
        // ambiguous head ("pepper"), where the aisle depends on the modifier.
        if (i > 0 && AMBIGUOUS_HEADS.has(p.candidates[i])) break;
        hit = { key: p.candidates[i], aisle, exact: i === 0 };
        break;
      }
    }

    if (hit) resolved.push({ ...p, ...hit });
    else misses.push(p);
  }

  return { resolved, misses };
}

module.exports = {
  normaliseIngredient,
  resolveAisles,
  splitCompoundLine,
  PROTECTED_PHRASES,
  singularise,
  SYNONYMS,
  AMBIGUOUS_HEADS,
  UNIT_WORDS,
  PREP_WORDS,
  FILLER_WORDS,
};
