'use strict';

/**
 * Human-authored source for the ingredient_aisles seed.
 * Grouped by aisle; keys are generated from these labels by build-seed.js
 * so that seed keys can never drift from normaliser output.
 *
 * Aisle taxonomy is deliberately coarse — it maps to how a UK supermarket
 * shopper physically walks a store, not to a retailer's internal categories.
 */

module.exports = {
  'fruit-veg': [
    'Apple', 'Banana', 'Orange', 'Lemon', 'Lime', 'Grapefruit', 'Satsuma',
    'Clementine', 'Pear', 'Grapes', 'Strawberry', 'Raspberry', 'Blueberry',
    'Blackberry', 'Cherry', 'Peach', 'Nectarine', 'Plum', 'Apricot', 'Mango',
    'Pineapple', 'Kiwi', 'Melon', 'Watermelon', 'Avocado', 'Pomegranate',
    'Fig', 'Rhubarb', 'Passion fruit', 'Papaya', 'Coconut',
    'Potato', 'Baby potato', 'New potato', 'Sweet potato', 'Carrot', 'Onion',
    'Red onion', 'Spring onion', 'Shallot', 'Garlic', 'Leek', 'Celery',
    'Celeriac', 'Parsnip', 'Turnip', 'Swede', 'Beetroot', 'Radish',
    'Broccoli', 'Tenderstem broccoli', 'Cauliflower', 'Cabbage', 'Red cabbage',
    'Savoy cabbage', 'Brussels sprout', 'Kale', 'Spinach', 'Baby spinach',
    'Chard', 'Pak choi', 'Lettuce', 'Romaine lettuce', 'Iceberg lettuce',
    'Rocket', 'Watercress', 'Mixed salad leaves', 'Spring greens',
    'Tomato', 'Cherry tomato', 'Vine tomato', 'Beef tomato', 'Cucumber',
    'Pepper', 'Red pepper', 'Green pepper', 'Yellow pepper', 'Chilli',
    'Jalapeno', 'Courgette', 'Aubergine', 'Butternut squash', 'Pumpkin',
    'Marrow', 'Mushroom', 'Chestnut mushroom', 'Portobello mushroom',
    'Shiitake mushroom', 'Asparagus', 'Green bean', 'Runner bean', 'Mangetout',
    'Sugar snap pea', 'Pea', 'Sweetcorn', 'Corn on the cob', 'Broad bean',
    'Artichoke', 'Fennel', 'Ginger', 'Lemongrass', 'Galangal', 'Samphire',
    'Horseradish root', 'Turmeric root', 'Beansprout', 'Edamame',
    'Fresh basil', 'Fresh coriander', 'Fresh parsley', 'Fresh mint',
    'Fresh thyme', 'Fresh rosemary', 'Fresh dill', 'Fresh chives',
    'Fresh sage', 'Fresh tarragon', 'Fresh oregano', 'Fresh bay leaf',
  ],

  'meat-poultry': [
    'Chicken breast', 'Chicken thigh', 'Chicken drumstick', 'Chicken wing',
    'Whole chicken', 'Chicken mince', 'Chicken liver',
    'Turkey breast', 'Turkey mince', 'Duck breast', 'Duck leg',
    'Beef mince', 'Steak', 'Sirloin steak', 'Ribeye steak', 'Rump steak',
    'Fillet steak', 'Braising steak', 'Stewing beef', 'Beef brisket',
    'Beef joint', 'Short rib', 'Ox cheek', 'Oxtail', 'Beef shin',
    'Pork chop', 'Pork loin', 'Pork belly', 'Pork shoulder', 'Pork mince',
    'Pork ribs', 'Sausage', 'Chipolata', 'Bacon', 'Streaky bacon',
    'Pancetta', 'Gammon', 'Ham hock', 'Lardons',
    'Lamb chop', 'Lamb mince', 'Leg of lamb', 'Lamb shoulder', 'Lamb shank',
    'Rack of lamb', 'Lamb neck fillet',
    'Liver', 'Kidney', 'Black pudding', 'Venison', 'Rabbit',
  ],

  'fish-seafood': [
    'Salmon fillet', 'Smoked salmon', 'Cod fillet', 'Haddock',
    'Smoked haddock', 'Sea bass', 'Sea bream', 'Plaice', 'Lemon sole',
    'Mackerel', 'Smoked mackerel', 'Trout', 'Tuna steak', 'Sardine',
    'Monkfish', 'Halibut', 'Pollock', 'Hake', 'Kipper', 'White fish',
    'Fish pie mix', 'Prawn', 'King prawn', 'Mussel', 'Clam', 'Scallop',
    'Squid', 'Calamari', 'Crab', 'Crab meat', 'Lobster', 'Oyster', 'Cockle',
  ],

  'dairy-eggs': [
    'Milk', 'Semi-skimmed milk', 'Whole milk', 'Skimmed milk', 'Oat milk',
    'Almond milk', 'Soya milk', 'Coconut milk drink', 'Buttermilk',
    'Butter', 'Unsalted butter', 'Margarine', 'Spreadable butter', 'Ghee',
    'Double cream', 'Single cream', 'Whipping cream', 'Soured cream',
    'Creme fraiche', 'Clotted cream', 'Squirty cream',
    'Yoghurt', 'Greek yoghurt', 'Natural yoghurt', 'Skyr', 'Kefir',
    'Egg', 'Duck egg', 'Quail egg',
    'Cheddar', 'Mature cheddar', 'Mozzarella', 'Buffalo mozzarella',
    'Parmesan', 'Feta', 'Halloumi', 'Goats cheese', 'Brie', 'Camembert',
    'Stilton', 'Blue cheese', 'Cream cheese', 'Mascarpone', 'Ricotta',
    'Cottage cheese', 'Grated cheese', 'Red leicester', 'Gruyere',
    'Emmental', 'Manchego', 'Wensleydale', 'Cheese slices',
  ],

  'chilled-deli': [
    'Fresh pasta', 'Fresh ravioli', 'Fresh gnocchi', 'Fresh lasagne sheets',
    'Shortcrust pastry', 'Puff pastry', 'Filo pastry', 'Pizza dough',
    'Pizza base', 'Hummus', 'Tzatziki', 'Guacamole', 'Salsa dip',
    'Chive dip', 'Taramasalata',
    'Cooked ham', 'Cooked chicken', 'Salami', 'Prosciutto', 'Parma ham',
    'Chorizo', 'Pepperoni', 'Pate', 'Scotch egg',
    'Tofu', 'Silken tofu', 'Tempeh', 'Quorn mince', 'Vegetarian sausage',
    'Vegetarian burger', 'Falafel',
  ],

  bakery: [
    'Bread', 'White bread', 'Wholemeal bread', 'Seeded bread', 'Sourdough',
    'Baguette', 'Ciabatta', 'Focaccia', 'Bread roll', 'Brioche', 'Bagel',
    'Pitta bread', 'Naan bread', 'Tortilla wrap', 'Flatbread', 'Crumpet',
    'English muffin', 'Croissant', 'Pain au chocolat', 'Scone', 'Doughnut',
    'Hot cross bun', 'Yorkshire pudding', 'Brioche bun', 'Burger bun',
    'Hot dog roll', 'Panettone', 'Malt loaf',
  ],

  frozen: [
    'Frozen chips', 'Oven chips', 'Sweet potato fries', 'Frozen peas',
    'Frozen sweetcorn', 'Frozen mixed vegetables', 'Frozen spinach',
    'Frozen broad beans', 'Frozen edamame', 'Frozen berries',
    'Frozen raspberries', 'Frozen prawns', 'Frozen fish fillet',
    'Fish fingers', 'Frozen pizza', 'Ice cream', 'Sorbet', 'Frozen yoghurt',
    'Frozen roast potatoes', 'Frozen chicken nuggets', 'Frozen burger',
    'Hash brown', 'Onion ring', 'Frozen waffle', 'Ice', 'Frozen pastry',
    'Frozen herbs', 'Frozen garlic',
  ],

  'tins-jars': [
    'Chopped tomatoes', 'Plum tomatoes', 'Passata', 'Tomato puree',
    'Sun dried tomato', 'Tinned tuna', 'Tinned salmon', 'Tinned sardines',
    'Anchovy', 'Baked beans', 'Kidney bean', 'Black bean', 'Cannellini bean',
    'Butter bean', 'Chickpea', 'Borlotti bean', 'Mixed beans', 'Haricot bean',
    'Refried beans', 'Tinned lentils', 'Tinned sweetcorn', 'Mushy peas',
    'Coconut milk', 'Coconut cream', 'Tinned peaches', 'Tinned pineapple',
    'Tinned pears', 'Mandarin segments', 'Tinned soup', 'Tinned potatoes',
    'Custard', 'Condensed milk', 'Evaporated milk', 'Olives', 'Caper',
    'Gherkin', 'Pickled onion', 'Roasted pepper', 'Artichoke heart',
    'Jackfruit', 'Water chestnut', 'Bamboo shoot', 'Tinned mackerel',
  ],

  'pasta-rice-grains': [
    'Spaghetti', 'Penne', 'Fusilli', 'Rigatoni', 'Macaroni', 'Tagliatelle',
    'Linguine', 'Farfalle', 'Conchiglie', 'Orzo', 'Lasagne sheet',
    'Cannelloni', 'Vermicelli', 'Pasta', 'Egg noodle', 'Rice noodle',
    'Udon noodle', 'Soba noodle', 'Ramen noodle', 'Instant noodle',
    'Basmati rice', 'Long grain rice', 'Brown rice', 'Arborio rice',
    'Risotto rice', 'Jasmine rice', 'Sushi rice', 'Wild rice', 'Paella rice',
    'Pudding rice', 'Rice',
    'Couscous', 'Bulgur wheat', 'Quinoa', 'Pearl barley', 'Polenta',
    'Oats', 'Porridge oats', 'Lentils', 'Red lentil', 'Green lentil',
    'Puy lentil', 'Split pea', 'Freekeh', 'Spelt',
  ],

  'cooking-oils-vinegars': [
    'Olive oil', 'Extra virgin olive oil', 'Vegetable oil', 'Sunflower oil',
    'Rapeseed oil', 'Coconut oil', 'Sesame oil', 'Groundnut oil',
    'Truffle oil', 'Cooking spray',
    'Balsamic vinegar', 'White wine vinegar', 'Red wine vinegar',
    'Cider vinegar', 'Malt vinegar', 'Rice vinegar', 'Sherry vinegar',
    'Chicken stock cube', 'Beef stock cube', 'Vegetable stock cube',
    'Fish stock cube', 'Stock pot', 'Bouillon powder', 'Gravy granules',
  ],

  'herbs-spices': [
    'Salt', 'Sea salt', 'Black pepper', 'White pepper', 'Peppercorn',
    'Dried oregano', 'Dried basil', 'Dried thyme', 'Dried rosemary',
    'Dried sage', 'Dried parsley', 'Dried mint', 'Dried dill',
    'Mixed herbs', 'Herbes de provence', 'Bay leaf',
    'Cumin', 'Ground cumin', 'Coriander seed', 'Ground coriander',
    'Turmeric', 'Paprika', 'Smoked paprika', 'Cayenne pepper',
    'Chilli powder', 'Chilli flakes', 'Curry powder', 'Garam masala',
    'Cinnamon', 'Cinnamon stick', 'Nutmeg', 'Ground ginger',
    'Ground cloves', 'Cardamom', 'Star anise', 'Allspice', 'Fennel seed', 'Mustard seed',
    'Caraway seed', 'Nigella seed', 'Celery salt', 'Garlic powder',
    'Onion powder', 'Saffron', 'Vanilla extract', 'Vanilla pod',
    'Sumac', 'Zaatar', 'Ras el hanout', 'Jerk seasoning', 'Fajita seasoning',
    'Italian seasoning', 'Chinese five spice', 'Cajun seasoning',
    'Piri piri seasoning', 'Curry leaf', 'Asafoetida', 'Juniper berry',
  ],

  'sauces-condiments': [
    'Ketchup', 'Brown sauce', 'Mayonnaise', 'Mustard', 'Dijon mustard',
    'Wholegrain mustard', 'English mustard', 'American mustard',
    'Worcestershire sauce', 'Soy sauce', 'Dark soy sauce', 'Light soy sauce',
    'Fish sauce', 'Oyster sauce', 'Hoisin sauce', 'Sriracha', 'Tabasco',
    'Hot sauce', 'Sweet chilli sauce', 'Barbecue sauce', 'Pesto', 'Red pesto',
    'Pasta sauce', 'Curry sauce', 'Horseradish sauce', 'Mint sauce',
    'Cranberry sauce', 'Apple sauce', 'Tartare sauce', 'Salad cream',
    'Salad dressing', 'Vinaigrette', 'Caesar dressing', 'Marmite',
    'Chutney', 'Mango chutney', 'Piccalilli', 'Branston pickle',
    'Jam', 'Strawberry jam', 'Raspberry jam', 'Marmalade', 'Honey',
    'Peanut butter', 'Chocolate spread', 'Lemon curd', 'Golden syrup',
    'Maple syrup', 'Treacle', 'Agave syrup',
  ],

  'world-foods': [
    'Thai red curry paste', 'Thai green curry paste', 'Korma paste',
    'Tikka masala paste', 'Rogan josh paste', 'Curry paste', 'Harissa',
    'Gochujang', 'Miso paste', 'Tahini', 'Wasabi', 'Mirin', 'Rice wine',
    'Sriracha mayo', 'Kimchi', 'Nori', 'Panko breadcrumbs', 'Rice paper',
    'Tortilla chips', 'Taco shell', 'Chipotle paste', 'Jerk paste',
    'Pomegranate molasses', 'Preserved lemon', 'Rose harissa', 'Dashi',
    'Coconut aminos', 'Tamarind paste', 'Yuzu juice',
  ],

  baking: [
    'Plain flour', 'Self-raising flour', 'Strong bread flour',
    'Wholemeal flour', 'Cornflour', 'Gram flour', 'Baking powder',
    'Bicarbonate of soda', 'Dried yeast', 'Fast action yeast',
    'Caster sugar', 'Golden caster sugar', 'Granulated sugar', 'Icing sugar',
    'Light brown sugar', 'Dark brown sugar', 'Demerara sugar',
    'Muscovado sugar', 'Cocoa powder', 'Dark chocolate', 'Milk chocolate',
    'White chocolate', 'Chocolate chip', 'Ground almond', 'Desiccated coconut',
    'Raisin', 'Sultana', 'Currant', 'Date', 'Dried apricot',
    'Dried cranberry', 'Dried mixed fruit', 'Glace cherry', 'Mixed peel',
    'Almond', 'Flaked almond', 'Walnut', 'Pecan', 'Hazelnut', 'Cashew',
    'Pistachio', 'Pine nut', 'Peanut', 'Mixed nuts', 'Sunflower seed',
    'Pumpkin seed', 'Sesame seed', 'Chia seed', 'Flaxseed', 'Poppy seed',
    'Gelatine', 'Food colouring', 'Icing decorations', 'Marzipan', 'Fondant icing',
    'Breadcrumbs', 'Suet', 'Mincemeat', 'Almond extract', 'Cake mix',
  ],

  'breakfast-cereals': [
    'Cornflakes', 'Bran flakes', 'Muesli', 'Granola', 'Weetabix',
    'Shredded wheat', 'Rice krispies', 'Cheerios', 'Breakfast cereal',
    'Cereal bar', 'Crunchy nut cornflakes',
  ],

  'snacks-confectionery': [
    'Crisps', 'Popcorn', 'Pretzel', 'Salted peanuts', 'Biscuit',
    'Digestive biscuit', 'Chocolate biscuit', 'Cracker', 'Oatcake',
    'Rice cake', 'Breadstick', 'Chocolate bar', 'Sweets', 'Crackers',
    'Poppadom', 'Tortilla crisps',
  ],

  'soft-drinks': [
    'Orange juice', 'Apple juice', 'Cranberry juice', 'Tomato juice',
    'Lemonade', 'Cola', 'Sparkling water', 'Still water', 'Tonic water',
    'Ginger beer', 'Ginger ale', 'Squash', 'Cordial', 'Elderflower cordial',
    'Coconut water', 'Energy drink', 'Iced tea',
  ],

  'tea-coffee': [
    'Tea bag', 'Green tea', 'Herbal tea', 'Earl grey', 'Peppermint tea',
    'Chai tea', 'Coffee', 'Ground coffee', 'Coffee beans', 'Instant coffee',
    'Hot chocolate', 'Drinking chocolate', 'Matcha powder',
  ],

  alcohol: [
    'Red wine', 'White wine', 'Rose wine', 'Prosecco', 'Champagne',
    'Beer', 'Lager', 'Ale', 'Stout', 'Cider', 'Vodka', 'Gin', 'Rum',
    'Whisky', 'Brandy', 'Sherry', 'Port', 'Marsala wine', 'Sake',
    'Vermouth', 'Triple sec', 'Cooking wine',
  ],

  household: [
    'Kitchen roll', 'Toilet roll', 'Washing up liquid', 'Dishwasher tablet',
    'Laundry detergent', 'Fabric softener', 'Bin bag', 'Cling film',
    'Tin foil', 'Baking paper', 'Sandwich bag', 'Sponge', 'Surface cleaner',
    'Bleach', 'Freezer bag', 'Kitchen towel', 'Batteries', 'Light bulb',
  ],

  'health-beauty': [
    'Toothpaste', 'Shampoo', 'Conditioner', 'Shower gel', 'Hand soap',
    'Deodorant', 'Razor', 'Paracetamol', 'Ibuprofen', 'Plaster',
    'Sun cream', 'Moisturiser', 'Cotton wool',
  ],
};
