'use strict';

/**
 * ingredient_aisles seed — 757 common UK grocery items.
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

const AISLES = [
  "fruit-veg",
  "meat-poultry",
  "fish-seafood",
  "dairy-eggs",
  "chilled-deli",
  "bakery",
  "frozen",
  "tins-jars",
  "pasta-rice-grains",
  "cooking-oils-vinegars",
  "herbs-spices",
  "sauces-condiments",
  "world-foods",
  "baking",
  "breakfast-cereals",
  "snacks-confectionery",
  "soft-drinks",
  "tea-coffee",
  "alcohol",
  "household",
  "health-beauty"
];

const INGREDIENT_AISLE_SEED = [
  {
    "key": "apple",
    "label": "Apple",
    "aisle": "fruit-veg"
  },
  {
    "key": "banana",
    "label": "Banana",
    "aisle": "fruit-veg"
  },
  {
    "key": "orange",
    "label": "Orange",
    "aisle": "fruit-veg"
  },
  {
    "key": "lemon",
    "label": "Lemon",
    "aisle": "fruit-veg"
  },
  {
    "key": "lime",
    "label": "Lime",
    "aisle": "fruit-veg"
  },
  {
    "key": "grapefruit",
    "label": "Grapefruit",
    "aisle": "fruit-veg"
  },
  {
    "key": "satsuma",
    "label": "Satsuma",
    "aisle": "fruit-veg"
  },
  {
    "key": "clementine",
    "label": "Clementine",
    "aisle": "fruit-veg"
  },
  {
    "key": "pear",
    "label": "Pear",
    "aisle": "fruit-veg"
  },
  {
    "key": "grape",
    "label": "Grapes",
    "aisle": "fruit-veg"
  },
  {
    "key": "strawberry",
    "label": "Strawberry",
    "aisle": "fruit-veg"
  },
  {
    "key": "raspberry",
    "label": "Raspberry",
    "aisle": "fruit-veg"
  },
  {
    "key": "blueberry",
    "label": "Blueberry",
    "aisle": "fruit-veg"
  },
  {
    "key": "blackberry",
    "label": "Blackberry",
    "aisle": "fruit-veg"
  },
  {
    "key": "cherry",
    "label": "Cherry",
    "aisle": "fruit-veg"
  },
  {
    "key": "peach",
    "label": "Peach",
    "aisle": "fruit-veg"
  },
  {
    "key": "nectarine",
    "label": "Nectarine",
    "aisle": "fruit-veg"
  },
  {
    "key": "plum",
    "label": "Plum",
    "aisle": "fruit-veg"
  },
  {
    "key": "apricot",
    "label": "Apricot",
    "aisle": "fruit-veg"
  },
  {
    "key": "mango",
    "label": "Mango",
    "aisle": "fruit-veg"
  },
  {
    "key": "pineapple",
    "label": "Pineapple",
    "aisle": "fruit-veg"
  },
  {
    "key": "kiwi",
    "label": "Kiwi",
    "aisle": "fruit-veg"
  },
  {
    "key": "melon",
    "label": "Melon",
    "aisle": "fruit-veg"
  },
  {
    "key": "watermelon",
    "label": "Watermelon",
    "aisle": "fruit-veg"
  },
  {
    "key": "avocado",
    "label": "Avocado",
    "aisle": "fruit-veg"
  },
  {
    "key": "pomegranate",
    "label": "Pomegranate",
    "aisle": "fruit-veg"
  },
  {
    "key": "fig",
    "label": "Fig",
    "aisle": "fruit-veg"
  },
  {
    "key": "rhubarb",
    "label": "Rhubarb",
    "aisle": "fruit-veg"
  },
  {
    "key": "passion fruit",
    "label": "Passion fruit",
    "aisle": "fruit-veg"
  },
  {
    "key": "papaya",
    "label": "Papaya",
    "aisle": "fruit-veg"
  },
  {
    "key": "coconut",
    "label": "Coconut",
    "aisle": "fruit-veg"
  },
  {
    "key": "potato",
    "label": "Potato",
    "aisle": "fruit-veg"
  },
  {
    "key": "baby potato",
    "label": "Baby potato",
    "aisle": "fruit-veg"
  },
  {
    "key": "new potato",
    "label": "New potato",
    "aisle": "fruit-veg"
  },
  {
    "key": "sweet potato",
    "label": "Sweet potato",
    "aisle": "fruit-veg"
  },
  {
    "key": "carrot",
    "label": "Carrot",
    "aisle": "fruit-veg"
  },
  {
    "key": "onion",
    "label": "Onion",
    "aisle": "fruit-veg"
  },
  {
    "key": "red onion",
    "label": "Red onion",
    "aisle": "fruit-veg"
  },
  {
    "key": "spring onion",
    "label": "Spring onion",
    "aisle": "fruit-veg"
  },
  {
    "key": "shallot",
    "label": "Shallot",
    "aisle": "fruit-veg"
  },
  {
    "key": "garlic",
    "label": "Garlic",
    "aisle": "fruit-veg"
  },
  {
    "key": "leek",
    "label": "Leek",
    "aisle": "fruit-veg"
  },
  {
    "key": "celery",
    "label": "Celery",
    "aisle": "fruit-veg"
  },
  {
    "key": "celeriac",
    "label": "Celeriac",
    "aisle": "fruit-veg"
  },
  {
    "key": "parsnip",
    "label": "Parsnip",
    "aisle": "fruit-veg"
  },
  {
    "key": "turnip",
    "label": "Turnip",
    "aisle": "fruit-veg"
  },
  {
    "key": "swede",
    "label": "Swede",
    "aisle": "fruit-veg"
  },
  {
    "key": "beetroot",
    "label": "Beetroot",
    "aisle": "fruit-veg"
  },
  {
    "key": "radish",
    "label": "Radish",
    "aisle": "fruit-veg"
  },
  {
    "key": "broccoli",
    "label": "Broccoli",
    "aisle": "fruit-veg"
  },
  {
    "key": "tenderstem broccoli",
    "label": "Tenderstem broccoli",
    "aisle": "fruit-veg"
  },
  {
    "key": "cauliflower",
    "label": "Cauliflower",
    "aisle": "fruit-veg"
  },
  {
    "key": "cabbage",
    "label": "Cabbage",
    "aisle": "fruit-veg"
  },
  {
    "key": "red cabbage",
    "label": "Red cabbage",
    "aisle": "fruit-veg"
  },
  {
    "key": "savoy cabbage",
    "label": "Savoy cabbage",
    "aisle": "fruit-veg"
  },
  {
    "key": "brussel sprout",
    "label": "Brussels sprout",
    "aisle": "fruit-veg"
  },
  {
    "key": "kale",
    "label": "Kale",
    "aisle": "fruit-veg"
  },
  {
    "key": "spinach",
    "label": "Spinach",
    "aisle": "fruit-veg"
  },
  {
    "key": "baby spinach",
    "label": "Baby spinach",
    "aisle": "fruit-veg"
  },
  {
    "key": "chard",
    "label": "Chard",
    "aisle": "fruit-veg"
  },
  {
    "key": "pak choi",
    "label": "Pak choi",
    "aisle": "fruit-veg"
  },
  {
    "key": "lettuce",
    "label": "Lettuce",
    "aisle": "fruit-veg"
  },
  {
    "key": "romaine lettuce",
    "label": "Romaine lettuce",
    "aisle": "fruit-veg"
  },
  {
    "key": "iceberg lettuce",
    "label": "Iceberg lettuce",
    "aisle": "fruit-veg"
  },
  {
    "key": "rocket",
    "label": "Rocket",
    "aisle": "fruit-veg"
  },
  {
    "key": "watercress",
    "label": "Watercress",
    "aisle": "fruit-veg"
  },
  {
    "key": "mixed salad leaf",
    "label": "Mixed salad leaves",
    "aisle": "fruit-veg"
  },
  {
    "key": "spring green",
    "label": "Spring greens",
    "aisle": "fruit-veg"
  },
  {
    "key": "tomato",
    "label": "Tomato",
    "aisle": "fruit-veg"
  },
  {
    "key": "cherry tomato",
    "label": "Cherry tomato",
    "aisle": "fruit-veg"
  },
  {
    "key": "vine tomato",
    "label": "Vine tomato",
    "aisle": "fruit-veg"
  },
  {
    "key": "beef tomato",
    "label": "Beef tomato",
    "aisle": "fruit-veg"
  },
  {
    "key": "cucumber",
    "label": "Cucumber",
    "aisle": "fruit-veg"
  },
  {
    "key": "pepper",
    "label": "Pepper",
    "aisle": "fruit-veg"
  },
  {
    "key": "red pepper",
    "label": "Red pepper",
    "aisle": "fruit-veg"
  },
  {
    "key": "green pepper",
    "label": "Green pepper",
    "aisle": "fruit-veg"
  },
  {
    "key": "yellow pepper",
    "label": "Yellow pepper",
    "aisle": "fruit-veg"
  },
  {
    "key": "chilli",
    "label": "Chilli",
    "aisle": "fruit-veg"
  },
  {
    "key": "jalapeno",
    "label": "Jalapeno",
    "aisle": "fruit-veg"
  },
  {
    "key": "courgette",
    "label": "Courgette",
    "aisle": "fruit-veg"
  },
  {
    "key": "aubergine",
    "label": "Aubergine",
    "aisle": "fruit-veg"
  },
  {
    "key": "butternut squash",
    "label": "Butternut squash",
    "aisle": "fruit-veg"
  },
  {
    "key": "pumpkin",
    "label": "Pumpkin",
    "aisle": "fruit-veg"
  },
  {
    "key": "marrow",
    "label": "Marrow",
    "aisle": "fruit-veg"
  },
  {
    "key": "mushroom",
    "label": "Mushroom",
    "aisle": "fruit-veg"
  },
  {
    "key": "chestnut mushroom",
    "label": "Chestnut mushroom",
    "aisle": "fruit-veg"
  },
  {
    "key": "portobello mushroom",
    "label": "Portobello mushroom",
    "aisle": "fruit-veg"
  },
  {
    "key": "shiitake mushroom",
    "label": "Shiitake mushroom",
    "aisle": "fruit-veg"
  },
  {
    "key": "asparagus",
    "label": "Asparagus",
    "aisle": "fruit-veg"
  },
  {
    "key": "green bean",
    "label": "Green bean",
    "aisle": "fruit-veg"
  },
  {
    "key": "runner bean",
    "label": "Runner bean",
    "aisle": "fruit-veg"
  },
  {
    "key": "mangetout",
    "label": "Mangetout",
    "aisle": "fruit-veg"
  },
  {
    "key": "sugar snap pea",
    "label": "Sugar snap pea",
    "aisle": "fruit-veg"
  },
  {
    "key": "pea",
    "label": "Pea",
    "aisle": "fruit-veg"
  },
  {
    "key": "sweetcorn",
    "label": "Sweetcorn",
    "aisle": "fruit-veg"
  },
  {
    "key": "corn on cob",
    "label": "Corn on the cob",
    "aisle": "fruit-veg"
  },
  {
    "key": "broad bean",
    "label": "Broad bean",
    "aisle": "fruit-veg"
  },
  {
    "key": "artichoke",
    "label": "Artichoke",
    "aisle": "fruit-veg"
  },
  {
    "key": "fennel",
    "label": "Fennel",
    "aisle": "fruit-veg"
  },
  {
    "key": "ginger",
    "label": "Ginger",
    "aisle": "fruit-veg"
  },
  {
    "key": "lemongrass",
    "label": "Lemongrass",
    "aisle": "fruit-veg"
  },
  {
    "key": "galangal",
    "label": "Galangal",
    "aisle": "fruit-veg"
  },
  {
    "key": "samphire",
    "label": "Samphire",
    "aisle": "fruit-veg"
  },
  {
    "key": "horseradish root",
    "label": "Horseradish root",
    "aisle": "fruit-veg"
  },
  {
    "key": "turmeric root",
    "label": "Turmeric root",
    "aisle": "fruit-veg"
  },
  {
    "key": "beansprout",
    "label": "Beansprout",
    "aisle": "fruit-veg"
  },
  {
    "key": "edamame",
    "label": "Edamame",
    "aisle": "fruit-veg"
  },
  {
    "key": "fresh basil",
    "label": "Fresh basil",
    "aisle": "fruit-veg"
  },
  {
    "key": "fresh coriander",
    "label": "Fresh coriander",
    "aisle": "fruit-veg"
  },
  {
    "key": "fresh parsley",
    "label": "Fresh parsley",
    "aisle": "fruit-veg"
  },
  {
    "key": "fresh mint",
    "label": "Fresh mint",
    "aisle": "fruit-veg"
  },
  {
    "key": "fresh thyme",
    "label": "Fresh thyme",
    "aisle": "fruit-veg"
  },
  {
    "key": "fresh rosemary",
    "label": "Fresh rosemary",
    "aisle": "fruit-veg"
  },
  {
    "key": "fresh dill",
    "label": "Fresh dill",
    "aisle": "fruit-veg"
  },
  {
    "key": "fresh chive",
    "label": "Fresh chives",
    "aisle": "fruit-veg"
  },
  {
    "key": "fresh sage",
    "label": "Fresh sage",
    "aisle": "fruit-veg"
  },
  {
    "key": "fresh tarragon",
    "label": "Fresh tarragon",
    "aisle": "fruit-veg"
  },
  {
    "key": "fresh oregano",
    "label": "Fresh oregano",
    "aisle": "fruit-veg"
  },
  {
    "key": "fresh bay leaf",
    "label": "Fresh bay leaf",
    "aisle": "fruit-veg"
  },
  {
    "key": "chicken breast",
    "label": "Chicken breast",
    "aisle": "meat-poultry"
  },
  {
    "key": "chicken thigh",
    "label": "Chicken thigh",
    "aisle": "meat-poultry"
  },
  {
    "key": "chicken drumstick",
    "label": "Chicken drumstick",
    "aisle": "meat-poultry"
  },
  {
    "key": "chicken wing",
    "label": "Chicken wing",
    "aisle": "meat-poultry"
  },
  {
    "key": "whole chicken",
    "label": "Whole chicken",
    "aisle": "meat-poultry"
  },
  {
    "key": "chicken mince",
    "label": "Chicken mince",
    "aisle": "meat-poultry"
  },
  {
    "key": "chicken liver",
    "label": "Chicken liver",
    "aisle": "meat-poultry"
  },
  {
    "key": "turkey breast",
    "label": "Turkey breast",
    "aisle": "meat-poultry"
  },
  {
    "key": "turkey mince",
    "label": "Turkey mince",
    "aisle": "meat-poultry"
  },
  {
    "key": "duck breast",
    "label": "Duck breast",
    "aisle": "meat-poultry"
  },
  {
    "key": "duck leg",
    "label": "Duck leg",
    "aisle": "meat-poultry"
  },
  {
    "key": "beef mince",
    "label": "Beef mince",
    "aisle": "meat-poultry"
  },
  {
    "key": "steak",
    "label": "Steak",
    "aisle": "meat-poultry"
  },
  {
    "key": "sirloin steak",
    "label": "Sirloin steak",
    "aisle": "meat-poultry"
  },
  {
    "key": "ribeye steak",
    "label": "Ribeye steak",
    "aisle": "meat-poultry"
  },
  {
    "key": "rump steak",
    "label": "Rump steak",
    "aisle": "meat-poultry"
  },
  {
    "key": "braising steak",
    "label": "Braising steak",
    "aisle": "meat-poultry"
  },
  {
    "key": "stewing beef",
    "label": "Stewing beef",
    "aisle": "meat-poultry"
  },
  {
    "key": "beef brisket",
    "label": "Beef brisket",
    "aisle": "meat-poultry"
  },
  {
    "key": "beef joint",
    "label": "Beef joint",
    "aisle": "meat-poultry"
  },
  {
    "key": "short rib",
    "label": "Short rib",
    "aisle": "meat-poultry"
  },
  {
    "key": "ox cheek",
    "label": "Ox cheek",
    "aisle": "meat-poultry"
  },
  {
    "key": "oxtail",
    "label": "Oxtail",
    "aisle": "meat-poultry"
  },
  {
    "key": "beef shin",
    "label": "Beef shin",
    "aisle": "meat-poultry"
  },
  {
    "key": "pork chop",
    "label": "Pork chop",
    "aisle": "meat-poultry"
  },
  {
    "key": "pork loin",
    "label": "Pork loin",
    "aisle": "meat-poultry"
  },
  {
    "key": "pork belly",
    "label": "Pork belly",
    "aisle": "meat-poultry"
  },
  {
    "key": "pork shoulder",
    "label": "Pork shoulder",
    "aisle": "meat-poultry"
  },
  {
    "key": "pork mince",
    "label": "Pork mince",
    "aisle": "meat-poultry"
  },
  {
    "key": "pork rib",
    "label": "Pork ribs",
    "aisle": "meat-poultry"
  },
  {
    "key": "sausage",
    "label": "Sausage",
    "aisle": "meat-poultry"
  },
  {
    "key": "chipolata",
    "label": "Chipolata",
    "aisle": "meat-poultry"
  },
  {
    "key": "bacon",
    "label": "Bacon",
    "aisle": "meat-poultry"
  },
  {
    "key": "streaky bacon",
    "label": "Streaky bacon",
    "aisle": "meat-poultry"
  },
  {
    "key": "pancetta",
    "label": "Pancetta",
    "aisle": "meat-poultry"
  },
  {
    "key": "gammon",
    "label": "Gammon",
    "aisle": "meat-poultry"
  },
  {
    "key": "ham hock",
    "label": "Ham hock",
    "aisle": "meat-poultry"
  },
  {
    "key": "lardon",
    "label": "Lardons",
    "aisle": "meat-poultry"
  },
  {
    "key": "lamb chop",
    "label": "Lamb chop",
    "aisle": "meat-poultry"
  },
  {
    "key": "lamb mince",
    "label": "Lamb mince",
    "aisle": "meat-poultry"
  },
  {
    "key": "leg lamb",
    "label": "Leg of lamb",
    "aisle": "meat-poultry"
  },
  {
    "key": "lamb shoulder",
    "label": "Lamb shoulder",
    "aisle": "meat-poultry"
  },
  {
    "key": "lamb shank",
    "label": "Lamb shank",
    "aisle": "meat-poultry"
  },
  {
    "key": "rack lamb",
    "label": "Rack of lamb",
    "aisle": "meat-poultry"
  },
  {
    "key": "lamb neck",
    "label": "Lamb neck fillet",
    "aisle": "meat-poultry"
  },
  {
    "key": "liver",
    "label": "Liver",
    "aisle": "meat-poultry"
  },
  {
    "key": "kidney",
    "label": "Kidney",
    "aisle": "meat-poultry"
  },
  {
    "key": "black pudding",
    "label": "Black pudding",
    "aisle": "meat-poultry"
  },
  {
    "key": "venison",
    "label": "Venison",
    "aisle": "meat-poultry"
  },
  {
    "key": "rabbit",
    "label": "Rabbit",
    "aisle": "meat-poultry"
  },
  {
    "key": "salmon",
    "label": "Salmon fillet",
    "aisle": "fish-seafood"
  },
  {
    "key": "smoked salmon",
    "label": "Smoked salmon",
    "aisle": "fish-seafood"
  },
  {
    "key": "cod",
    "label": "Cod fillet",
    "aisle": "fish-seafood"
  },
  {
    "key": "haddock",
    "label": "Haddock",
    "aisle": "fish-seafood"
  },
  {
    "key": "smoked haddock",
    "label": "Smoked haddock",
    "aisle": "fish-seafood"
  },
  {
    "key": "sea bass",
    "label": "Sea bass",
    "aisle": "fish-seafood"
  },
  {
    "key": "sea bream",
    "label": "Sea bream",
    "aisle": "fish-seafood"
  },
  {
    "key": "plaice",
    "label": "Plaice",
    "aisle": "fish-seafood"
  },
  {
    "key": "lemon sole",
    "label": "Lemon sole",
    "aisle": "fish-seafood"
  },
  {
    "key": "mackerel",
    "label": "Mackerel",
    "aisle": "fish-seafood"
  },
  {
    "key": "smoked mackerel",
    "label": "Smoked mackerel",
    "aisle": "fish-seafood"
  },
  {
    "key": "trout",
    "label": "Trout",
    "aisle": "fish-seafood"
  },
  {
    "key": "tuna steak",
    "label": "Tuna steak",
    "aisle": "fish-seafood"
  },
  {
    "key": "sardine",
    "label": "Sardine",
    "aisle": "fish-seafood"
  },
  {
    "key": "monkfish",
    "label": "Monkfish",
    "aisle": "fish-seafood"
  },
  {
    "key": "halibut",
    "label": "Halibut",
    "aisle": "fish-seafood"
  },
  {
    "key": "pollock",
    "label": "Pollock",
    "aisle": "fish-seafood"
  },
  {
    "key": "hake",
    "label": "Hake",
    "aisle": "fish-seafood"
  },
  {
    "key": "kipper",
    "label": "Kipper",
    "aisle": "fish-seafood"
  },
  {
    "key": "white fish",
    "label": "White fish",
    "aisle": "fish-seafood"
  },
  {
    "key": "fish pie mix",
    "label": "Fish pie mix",
    "aisle": "fish-seafood"
  },
  {
    "key": "prawn",
    "label": "Prawn",
    "aisle": "fish-seafood"
  },
  {
    "key": "king prawn",
    "label": "King prawn",
    "aisle": "fish-seafood"
  },
  {
    "key": "mussel",
    "label": "Mussel",
    "aisle": "fish-seafood"
  },
  {
    "key": "clam",
    "label": "Clam",
    "aisle": "fish-seafood"
  },
  {
    "key": "scallop",
    "label": "Scallop",
    "aisle": "fish-seafood"
  },
  {
    "key": "squid",
    "label": "Squid",
    "aisle": "fish-seafood"
  },
  {
    "key": "calamari",
    "label": "Calamari",
    "aisle": "fish-seafood"
  },
  {
    "key": "crab",
    "label": "Crab",
    "aisle": "fish-seafood"
  },
  {
    "key": "crab meat",
    "label": "Crab meat",
    "aisle": "fish-seafood"
  },
  {
    "key": "lobster",
    "label": "Lobster",
    "aisle": "fish-seafood"
  },
  {
    "key": "oyster",
    "label": "Oyster",
    "aisle": "fish-seafood"
  },
  {
    "key": "cockle",
    "label": "Cockle",
    "aisle": "fish-seafood"
  },
  {
    "key": "milk",
    "label": "Milk",
    "aisle": "dairy-eggs"
  },
  {
    "key": "semi skimmed milk",
    "label": "Semi-skimmed milk",
    "aisle": "dairy-eggs"
  },
  {
    "key": "whole milk",
    "label": "Whole milk",
    "aisle": "dairy-eggs"
  },
  {
    "key": "skimmed milk",
    "label": "Skimmed milk",
    "aisle": "dairy-eggs"
  },
  {
    "key": "oat milk",
    "label": "Oat milk",
    "aisle": "dairy-eggs"
  },
  {
    "key": "almond milk",
    "label": "Almond milk",
    "aisle": "dairy-eggs"
  },
  {
    "key": "soya milk",
    "label": "Soya milk",
    "aisle": "dairy-eggs"
  },
  {
    "key": "coconut milk drink",
    "label": "Coconut milk drink",
    "aisle": "dairy-eggs"
  },
  {
    "key": "buttermilk",
    "label": "Buttermilk",
    "aisle": "dairy-eggs"
  },
  {
    "key": "butter",
    "label": "Butter",
    "aisle": "dairy-eggs"
  },
  {
    "key": "unsalted butter",
    "label": "Unsalted butter",
    "aisle": "dairy-eggs"
  },
  {
    "key": "margarine",
    "label": "Margarine",
    "aisle": "dairy-eggs"
  },
  {
    "key": "spreadable butter",
    "label": "Spreadable butter",
    "aisle": "dairy-eggs"
  },
  {
    "key": "ghee",
    "label": "Ghee",
    "aisle": "dairy-eggs"
  },
  {
    "key": "double cream",
    "label": "Double cream",
    "aisle": "dairy-eggs"
  },
  {
    "key": "single cream",
    "label": "Single cream",
    "aisle": "dairy-eggs"
  },
  {
    "key": "whipping cream",
    "label": "Whipping cream",
    "aisle": "dairy-eggs"
  },
  {
    "key": "soured cream",
    "label": "Soured cream",
    "aisle": "dairy-eggs"
  },
  {
    "key": "creme fraiche",
    "label": "Creme fraiche",
    "aisle": "dairy-eggs"
  },
  {
    "key": "clotted cream",
    "label": "Clotted cream",
    "aisle": "dairy-eggs"
  },
  {
    "key": "squirty cream",
    "label": "Squirty cream",
    "aisle": "dairy-eggs"
  },
  {
    "key": "yoghurt",
    "label": "Yoghurt",
    "aisle": "dairy-eggs"
  },
  {
    "key": "greek yoghurt",
    "label": "Greek yoghurt",
    "aisle": "dairy-eggs"
  },
  {
    "key": "natural yoghurt",
    "label": "Natural yoghurt",
    "aisle": "dairy-eggs"
  },
  {
    "key": "skyr",
    "label": "Skyr",
    "aisle": "dairy-eggs"
  },
  {
    "key": "kefir",
    "label": "Kefir",
    "aisle": "dairy-eggs"
  },
  {
    "key": "egg",
    "label": "Egg",
    "aisle": "dairy-eggs"
  },
  {
    "key": "duck egg",
    "label": "Duck egg",
    "aisle": "dairy-eggs"
  },
  {
    "key": "quail egg",
    "label": "Quail egg",
    "aisle": "dairy-eggs"
  },
  {
    "key": "cheddar",
    "label": "Cheddar",
    "aisle": "dairy-eggs"
  },
  {
    "key": "mature cheddar",
    "label": "Mature cheddar",
    "aisle": "dairy-eggs"
  },
  {
    "key": "mozzarella",
    "label": "Mozzarella",
    "aisle": "dairy-eggs"
  },
  {
    "key": "buffalo mozzarella",
    "label": "Buffalo mozzarella",
    "aisle": "dairy-eggs"
  },
  {
    "key": "parmesan",
    "label": "Parmesan",
    "aisle": "dairy-eggs"
  },
  {
    "key": "feta",
    "label": "Feta",
    "aisle": "dairy-eggs"
  },
  {
    "key": "halloumi",
    "label": "Halloumi",
    "aisle": "dairy-eggs"
  },
  {
    "key": "goat cheese",
    "label": "Goats cheese",
    "aisle": "dairy-eggs"
  },
  {
    "key": "brie",
    "label": "Brie",
    "aisle": "dairy-eggs"
  },
  {
    "key": "camembert",
    "label": "Camembert",
    "aisle": "dairy-eggs"
  },
  {
    "key": "stilton",
    "label": "Stilton",
    "aisle": "dairy-eggs"
  },
  {
    "key": "blue cheese",
    "label": "Blue cheese",
    "aisle": "dairy-eggs"
  },
  {
    "key": "cream cheese",
    "label": "Cream cheese",
    "aisle": "dairy-eggs"
  },
  {
    "key": "mascarpone",
    "label": "Mascarpone",
    "aisle": "dairy-eggs"
  },
  {
    "key": "ricotta",
    "label": "Ricotta",
    "aisle": "dairy-eggs"
  },
  {
    "key": "cottage cheese",
    "label": "Cottage cheese",
    "aisle": "dairy-eggs"
  },
  {
    "key": "grated cheese",
    "label": "Grated cheese",
    "aisle": "dairy-eggs"
  },
  {
    "key": "red leicester",
    "label": "Red leicester",
    "aisle": "dairy-eggs"
  },
  {
    "key": "gruyere",
    "label": "Gruyere",
    "aisle": "dairy-eggs"
  },
  {
    "key": "emmental",
    "label": "Emmental",
    "aisle": "dairy-eggs"
  },
  {
    "key": "manchego",
    "label": "Manchego",
    "aisle": "dairy-eggs"
  },
  {
    "key": "wensleydale",
    "label": "Wensleydale",
    "aisle": "dairy-eggs"
  },
  {
    "key": "cheese",
    "label": "Cheese slices",
    "aisle": "dairy-eggs"
  },
  {
    "key": "fresh pasta",
    "label": "Fresh pasta",
    "aisle": "chilled-deli"
  },
  {
    "key": "fresh ravioli",
    "label": "Fresh ravioli",
    "aisle": "chilled-deli"
  },
  {
    "key": "fresh gnocchi",
    "label": "Fresh gnocchi",
    "aisle": "chilled-deli"
  },
  {
    "key": "fresh lasagne sheet",
    "label": "Fresh lasagne sheets",
    "aisle": "chilled-deli"
  },
  {
    "key": "shortcrust pastry",
    "label": "Shortcrust pastry",
    "aisle": "chilled-deli"
  },
  {
    "key": "puff pastry",
    "label": "Puff pastry",
    "aisle": "chilled-deli"
  },
  {
    "key": "filo pastry",
    "label": "Filo pastry",
    "aisle": "chilled-deli"
  },
  {
    "key": "pizza dough",
    "label": "Pizza dough",
    "aisle": "chilled-deli"
  },
  {
    "key": "pizza base",
    "label": "Pizza base",
    "aisle": "chilled-deli"
  },
  {
    "key": "hummus",
    "label": "Hummus",
    "aisle": "chilled-deli"
  },
  {
    "key": "tzatziki",
    "label": "Tzatziki",
    "aisle": "chilled-deli"
  },
  {
    "key": "guacamole",
    "label": "Guacamole",
    "aisle": "chilled-deli"
  },
  {
    "key": "salsa dip",
    "label": "Salsa dip",
    "aisle": "chilled-deli"
  },
  {
    "key": "chive dip",
    "label": "Chive dip",
    "aisle": "chilled-deli"
  },
  {
    "key": "taramasalata",
    "label": "Taramasalata",
    "aisle": "chilled-deli"
  },
  {
    "key": "cooked ham",
    "label": "Cooked ham",
    "aisle": "chilled-deli"
  },
  {
    "key": "cooked chicken",
    "label": "Cooked chicken",
    "aisle": "chilled-deli"
  },
  {
    "key": "salami",
    "label": "Salami",
    "aisle": "chilled-deli"
  },
  {
    "key": "prosciutto",
    "label": "Prosciutto",
    "aisle": "chilled-deli"
  },
  {
    "key": "parma ham",
    "label": "Parma ham",
    "aisle": "chilled-deli"
  },
  {
    "key": "chorizo",
    "label": "Chorizo",
    "aisle": "chilled-deli"
  },
  {
    "key": "pepperoni",
    "label": "Pepperoni",
    "aisle": "chilled-deli"
  },
  {
    "key": "pate",
    "label": "Pate",
    "aisle": "chilled-deli"
  },
  {
    "key": "scotch egg",
    "label": "Scotch egg",
    "aisle": "chilled-deli"
  },
  {
    "key": "tofu",
    "label": "Tofu",
    "aisle": "chilled-deli"
  },
  {
    "key": "silken tofu",
    "label": "Silken tofu",
    "aisle": "chilled-deli"
  },
  {
    "key": "tempeh",
    "label": "Tempeh",
    "aisle": "chilled-deli"
  },
  {
    "key": "quorn mince",
    "label": "Quorn mince",
    "aisle": "chilled-deli"
  },
  {
    "key": "vegetarian sausage",
    "label": "Vegetarian sausage",
    "aisle": "chilled-deli"
  },
  {
    "key": "vegetarian burger",
    "label": "Vegetarian burger",
    "aisle": "chilled-deli"
  },
  {
    "key": "falafel",
    "label": "Falafel",
    "aisle": "chilled-deli"
  },
  {
    "key": "bread",
    "label": "Bread",
    "aisle": "bakery"
  },
  {
    "key": "white bread",
    "label": "White bread",
    "aisle": "bakery"
  },
  {
    "key": "wholemeal bread",
    "label": "Wholemeal bread",
    "aisle": "bakery"
  },
  {
    "key": "sourdough",
    "label": "Sourdough",
    "aisle": "bakery"
  },
  {
    "key": "baguette",
    "label": "Baguette",
    "aisle": "bakery"
  },
  {
    "key": "ciabatta",
    "label": "Ciabatta",
    "aisle": "bakery"
  },
  {
    "key": "focaccia",
    "label": "Focaccia",
    "aisle": "bakery"
  },
  {
    "key": "bread roll",
    "label": "Bread roll",
    "aisle": "bakery"
  },
  {
    "key": "brioche",
    "label": "Brioche",
    "aisle": "bakery"
  },
  {
    "key": "bagel",
    "label": "Bagel",
    "aisle": "bakery"
  },
  {
    "key": "pitta bread",
    "label": "Pitta bread",
    "aisle": "bakery"
  },
  {
    "key": "naan bread",
    "label": "Naan bread",
    "aisle": "bakery"
  },
  {
    "key": "tortilla wrap",
    "label": "Tortilla wrap",
    "aisle": "bakery"
  },
  {
    "key": "flatbread",
    "label": "Flatbread",
    "aisle": "bakery"
  },
  {
    "key": "crumpet",
    "label": "Crumpet",
    "aisle": "bakery"
  },
  {
    "key": "english muffin",
    "label": "English muffin",
    "aisle": "bakery"
  },
  {
    "key": "croissant",
    "label": "Croissant",
    "aisle": "bakery"
  },
  {
    "key": "pain au chocolat",
    "label": "Pain au chocolat",
    "aisle": "bakery"
  },
  {
    "key": "scone",
    "label": "Scone",
    "aisle": "bakery"
  },
  {
    "key": "doughnut",
    "label": "Doughnut",
    "aisle": "bakery"
  },
  {
    "key": "cross bun",
    "label": "Hot cross bun",
    "aisle": "bakery"
  },
  {
    "key": "yorkshire pudding",
    "label": "Yorkshire pudding",
    "aisle": "bakery"
  },
  {
    "key": "brioche bun",
    "label": "Brioche bun",
    "aisle": "bakery"
  },
  {
    "key": "burger bun",
    "label": "Burger bun",
    "aisle": "bakery"
  },
  {
    "key": "dog roll",
    "label": "Hot dog roll",
    "aisle": "bakery"
  },
  {
    "key": "panettone",
    "label": "Panettone",
    "aisle": "bakery"
  },
  {
    "key": "malt loaf",
    "label": "Malt loaf",
    "aisle": "bakery"
  },
  {
    "key": "frozen chip",
    "label": "Frozen chips",
    "aisle": "frozen"
  },
  {
    "key": "oven chip",
    "label": "Oven chips",
    "aisle": "frozen"
  },
  {
    "key": "sweet potato fry",
    "label": "Sweet potato fries",
    "aisle": "frozen"
  },
  {
    "key": "frozen pea",
    "label": "Frozen peas",
    "aisle": "frozen"
  },
  {
    "key": "frozen sweetcorn",
    "label": "Frozen sweetcorn",
    "aisle": "frozen"
  },
  {
    "key": "frozen mixed vegetable",
    "label": "Frozen mixed vegetables",
    "aisle": "frozen"
  },
  {
    "key": "frozen spinach",
    "label": "Frozen spinach",
    "aisle": "frozen"
  },
  {
    "key": "frozen broad bean",
    "label": "Frozen broad beans",
    "aisle": "frozen"
  },
  {
    "key": "frozen edamame",
    "label": "Frozen edamame",
    "aisle": "frozen"
  },
  {
    "key": "frozen berry",
    "label": "Frozen berries",
    "aisle": "frozen"
  },
  {
    "key": "frozen raspberry",
    "label": "Frozen raspberries",
    "aisle": "frozen"
  },
  {
    "key": "frozen prawn",
    "label": "Frozen prawns",
    "aisle": "frozen"
  },
  {
    "key": "frozen fish",
    "label": "Frozen fish fillet",
    "aisle": "frozen"
  },
  {
    "key": "fish finger",
    "label": "Fish fingers",
    "aisle": "frozen"
  },
  {
    "key": "frozen pizza",
    "label": "Frozen pizza",
    "aisle": "frozen"
  },
  {
    "key": "ice cream",
    "label": "Ice cream",
    "aisle": "frozen"
  },
  {
    "key": "sorbet",
    "label": "Sorbet",
    "aisle": "frozen"
  },
  {
    "key": "frozen yoghurt",
    "label": "Frozen yoghurt",
    "aisle": "frozen"
  },
  {
    "key": "frozen roast potato",
    "label": "Frozen roast potatoes",
    "aisle": "frozen"
  },
  {
    "key": "frozen chicken nugget",
    "label": "Frozen chicken nuggets",
    "aisle": "frozen"
  },
  {
    "key": "frozen burger",
    "label": "Frozen burger",
    "aisle": "frozen"
  },
  {
    "key": "hash brown",
    "label": "Hash brown",
    "aisle": "frozen"
  },
  {
    "key": "onion ring",
    "label": "Onion ring",
    "aisle": "frozen"
  },
  {
    "key": "frozen waffle",
    "label": "Frozen waffle",
    "aisle": "frozen"
  },
  {
    "key": "ice",
    "label": "Ice",
    "aisle": "frozen"
  },
  {
    "key": "frozen pastry",
    "label": "Frozen pastry",
    "aisle": "frozen"
  },
  {
    "key": "frozen herb",
    "label": "Frozen herbs",
    "aisle": "frozen"
  },
  {
    "key": "frozen garlic",
    "label": "Frozen garlic",
    "aisle": "frozen"
  },
  {
    "key": "chopped tomatoes",
    "label": "Chopped tomatoes",
    "aisle": "tins-jars"
  },
  {
    "key": "plum tomatoes",
    "label": "Plum tomatoes",
    "aisle": "tins-jars"
  },
  {
    "key": "passata",
    "label": "Passata",
    "aisle": "tins-jars"
  },
  {
    "key": "tomato puree",
    "label": "Tomato puree",
    "aisle": "tins-jars"
  },
  {
    "key": "sun dried tomato",
    "label": "Sun dried tomato",
    "aisle": "tins-jars"
  },
  {
    "key": "tinned tuna",
    "label": "Tinned tuna",
    "aisle": "tins-jars"
  },
  {
    "key": "tinned salmon",
    "label": "Tinned salmon",
    "aisle": "tins-jars"
  },
  {
    "key": "tinned sardine",
    "label": "Tinned sardines",
    "aisle": "tins-jars"
  },
  {
    "key": "anchovy",
    "label": "Anchovy",
    "aisle": "tins-jars"
  },
  {
    "key": "baked bean",
    "label": "Baked beans",
    "aisle": "tins-jars"
  },
  {
    "key": "kidney bean",
    "label": "Kidney bean",
    "aisle": "tins-jars"
  },
  {
    "key": "black bean",
    "label": "Black bean",
    "aisle": "tins-jars"
  },
  {
    "key": "cannellini bean",
    "label": "Cannellini bean",
    "aisle": "tins-jars"
  },
  {
    "key": "butter bean",
    "label": "Butter bean",
    "aisle": "tins-jars"
  },
  {
    "key": "chickpea",
    "label": "Chickpea",
    "aisle": "tins-jars"
  },
  {
    "key": "borlotti bean",
    "label": "Borlotti bean",
    "aisle": "tins-jars"
  },
  {
    "key": "mixed bean",
    "label": "Mixed beans",
    "aisle": "tins-jars"
  },
  {
    "key": "haricot bean",
    "label": "Haricot bean",
    "aisle": "tins-jars"
  },
  {
    "key": "refried bean",
    "label": "Refried beans",
    "aisle": "tins-jars"
  },
  {
    "key": "tinned lentil",
    "label": "Tinned lentils",
    "aisle": "tins-jars"
  },
  {
    "key": "tinned sweetcorn",
    "label": "Tinned sweetcorn",
    "aisle": "tins-jars"
  },
  {
    "key": "mushy pea",
    "label": "Mushy peas",
    "aisle": "tins-jars"
  },
  {
    "key": "coconut milk",
    "label": "Coconut milk",
    "aisle": "tins-jars"
  },
  {
    "key": "coconut cream",
    "label": "Coconut cream",
    "aisle": "tins-jars"
  },
  {
    "key": "tinned peach",
    "label": "Tinned peaches",
    "aisle": "tins-jars"
  },
  {
    "key": "tinned pineapple",
    "label": "Tinned pineapple",
    "aisle": "tins-jars"
  },
  {
    "key": "tinned pear",
    "label": "Tinned pears",
    "aisle": "tins-jars"
  },
  {
    "key": "mandarin segment",
    "label": "Mandarin segments",
    "aisle": "tins-jars"
  },
  {
    "key": "tinned soup",
    "label": "Tinned soup",
    "aisle": "tins-jars"
  },
  {
    "key": "tinned potato",
    "label": "Tinned potatoes",
    "aisle": "tins-jars"
  },
  {
    "key": "custard",
    "label": "Custard",
    "aisle": "tins-jars"
  },
  {
    "key": "condensed milk",
    "label": "Condensed milk",
    "aisle": "tins-jars"
  },
  {
    "key": "evaporated milk",
    "label": "Evaporated milk",
    "aisle": "tins-jars"
  },
  {
    "key": "olive",
    "label": "Olives",
    "aisle": "tins-jars"
  },
  {
    "key": "caper",
    "label": "Caper",
    "aisle": "tins-jars"
  },
  {
    "key": "gherkin",
    "label": "Gherkin",
    "aisle": "tins-jars"
  },
  {
    "key": "pickled onion",
    "label": "Pickled onion",
    "aisle": "tins-jars"
  },
  {
    "key": "roasted pepper",
    "label": "Roasted pepper",
    "aisle": "tins-jars"
  },
  {
    "key": "artichoke heart",
    "label": "Artichoke heart",
    "aisle": "tins-jars"
  },
  {
    "key": "jackfruit",
    "label": "Jackfruit",
    "aisle": "tins-jars"
  },
  {
    "key": "water chestnut",
    "label": "Water chestnut",
    "aisle": "tins-jars"
  },
  {
    "key": "bamboo shoot",
    "label": "Bamboo shoot",
    "aisle": "tins-jars"
  },
  {
    "key": "tinned mackerel",
    "label": "Tinned mackerel",
    "aisle": "tins-jars"
  },
  {
    "key": "spaghetti",
    "label": "Spaghetti",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "penne",
    "label": "Penne",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "fusilli",
    "label": "Fusilli",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "rigatoni",
    "label": "Rigatoni",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "macaroni",
    "label": "Macaroni",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "tagliatelle",
    "label": "Tagliatelle",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "linguine",
    "label": "Linguine",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "farfalle",
    "label": "Farfalle",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "conchiglie",
    "label": "Conchiglie",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "orzo",
    "label": "Orzo",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "lasagne sheet",
    "label": "Lasagne sheet",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "cannelloni",
    "label": "Cannelloni",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "vermicelli",
    "label": "Vermicelli",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "pasta",
    "label": "Pasta",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "egg noodle",
    "label": "Egg noodle",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "rice noodle",
    "label": "Rice noodle",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "udon noodle",
    "label": "Udon noodle",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "soba noodle",
    "label": "Soba noodle",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "ramen noodle",
    "label": "Ramen noodle",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "instant noodle",
    "label": "Instant noodle",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "basmati rice",
    "label": "Basmati rice",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "long grain rice",
    "label": "Long grain rice",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "brown rice",
    "label": "Brown rice",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "arborio rice",
    "label": "Arborio rice",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "risotto rice",
    "label": "Risotto rice",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "jasmine rice",
    "label": "Jasmine rice",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "sushi rice",
    "label": "Sushi rice",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "wild rice",
    "label": "Wild rice",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "paella rice",
    "label": "Paella rice",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "pudding rice",
    "label": "Pudding rice",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "rice",
    "label": "Rice",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "couscous",
    "label": "Couscous",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "bulgur wheat",
    "label": "Bulgur wheat",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "quinoa",
    "label": "Quinoa",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "pearl barley",
    "label": "Pearl barley",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "polenta",
    "label": "Polenta",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "oat",
    "label": "Oats",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "porridge oat",
    "label": "Porridge oats",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "lentil",
    "label": "Lentils",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "red lentil",
    "label": "Red lentil",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "green lentil",
    "label": "Green lentil",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "puy lentil",
    "label": "Puy lentil",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "split pea",
    "label": "Split pea",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "freekeh",
    "label": "Freekeh",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "spelt",
    "label": "Spelt",
    "aisle": "pasta-rice-grains"
  },
  {
    "key": "olive oil",
    "label": "Olive oil",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "extra virgin olive oil",
    "label": "Extra virgin olive oil",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "vegetable oil",
    "label": "Vegetable oil",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "sunflower oil",
    "label": "Sunflower oil",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "rapeseed oil",
    "label": "Rapeseed oil",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "coconut oil",
    "label": "Coconut oil",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "sesame oil",
    "label": "Sesame oil",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "groundnut oil",
    "label": "Groundnut oil",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "truffle oil",
    "label": "Truffle oil",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "cooking spray",
    "label": "Cooking spray",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "balsamic vinegar",
    "label": "Balsamic vinegar",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "white wine vinegar",
    "label": "White wine vinegar",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "red wine vinegar",
    "label": "Red wine vinegar",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "cider vinegar",
    "label": "Cider vinegar",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "malt vinegar",
    "label": "Malt vinegar",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "rice vinegar",
    "label": "Rice vinegar",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "sherry vinegar",
    "label": "Sherry vinegar",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "chicken stock cube",
    "label": "Chicken stock cube",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "beef stock cube",
    "label": "Beef stock cube",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "vegetable stock cube",
    "label": "Vegetable stock cube",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "fish stock cube",
    "label": "Fish stock cube",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "stock",
    "label": "Stock pot",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "bouillon powder",
    "label": "Bouillon powder",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "gravy granule",
    "label": "Gravy granules",
    "aisle": "cooking-oils-vinegars"
  },
  {
    "key": "salt",
    "label": "Salt",
    "aisle": "herbs-spices"
  },
  {
    "key": "sea salt",
    "label": "Sea salt",
    "aisle": "herbs-spices"
  },
  {
    "key": "black pepper",
    "label": "Black pepper",
    "aisle": "herbs-spices"
  },
  {
    "key": "white pepper",
    "label": "White pepper",
    "aisle": "herbs-spices"
  },
  {
    "key": "peppercorn",
    "label": "Peppercorn",
    "aisle": "herbs-spices"
  },
  {
    "key": "dried oregano",
    "label": "Dried oregano",
    "aisle": "herbs-spices"
  },
  {
    "key": "dried basil",
    "label": "Dried basil",
    "aisle": "herbs-spices"
  },
  {
    "key": "dried thyme",
    "label": "Dried thyme",
    "aisle": "herbs-spices"
  },
  {
    "key": "dried rosemary",
    "label": "Dried rosemary",
    "aisle": "herbs-spices"
  },
  {
    "key": "dried sage",
    "label": "Dried sage",
    "aisle": "herbs-spices"
  },
  {
    "key": "dried parsley",
    "label": "Dried parsley",
    "aisle": "herbs-spices"
  },
  {
    "key": "dried mint",
    "label": "Dried mint",
    "aisle": "herbs-spices"
  },
  {
    "key": "dried dill",
    "label": "Dried dill",
    "aisle": "herbs-spices"
  },
  {
    "key": "mixed herbs",
    "label": "Mixed herbs",
    "aisle": "herbs-spices"
  },
  {
    "key": "herbe de provence",
    "label": "Herbes de provence",
    "aisle": "herbs-spices"
  },
  {
    "key": "bay leaf",
    "label": "Bay leaf",
    "aisle": "herbs-spices"
  },
  {
    "key": "cumin",
    "label": "Cumin",
    "aisle": "herbs-spices"
  },
  {
    "key": "ground cumin",
    "label": "Ground cumin",
    "aisle": "herbs-spices"
  },
  {
    "key": "coriander seed",
    "label": "Coriander seed",
    "aisle": "herbs-spices"
  },
  {
    "key": "ground coriander",
    "label": "Ground coriander",
    "aisle": "herbs-spices"
  },
  {
    "key": "turmeric",
    "label": "Turmeric",
    "aisle": "herbs-spices"
  },
  {
    "key": "paprika",
    "label": "Paprika",
    "aisle": "herbs-spices"
  },
  {
    "key": "smoked paprika",
    "label": "Smoked paprika",
    "aisle": "herbs-spices"
  },
  {
    "key": "cayenne pepper",
    "label": "Cayenne pepper",
    "aisle": "herbs-spices"
  },
  {
    "key": "chilli powder",
    "label": "Chilli powder",
    "aisle": "herbs-spices"
  },
  {
    "key": "chilli flakes",
    "label": "Chilli flakes",
    "aisle": "herbs-spices"
  },
  {
    "key": "curry powder",
    "label": "Curry powder",
    "aisle": "herbs-spices"
  },
  {
    "key": "garam masala",
    "label": "Garam masala",
    "aisle": "herbs-spices"
  },
  {
    "key": "cinnamon",
    "label": "Cinnamon",
    "aisle": "herbs-spices"
  },
  {
    "key": "nutmeg",
    "label": "Nutmeg",
    "aisle": "herbs-spices"
  },
  {
    "key": "ground ginger",
    "label": "Ground ginger",
    "aisle": "herbs-spices"
  },
  {
    "key": "ground clove",
    "label": "Ground cloves",
    "aisle": "herbs-spices"
  },
  {
    "key": "cardamom",
    "label": "Cardamom",
    "aisle": "herbs-spices"
  },
  {
    "key": "star anise",
    "label": "Star anise",
    "aisle": "herbs-spices"
  },
  {
    "key": "allspice",
    "label": "Allspice",
    "aisle": "herbs-spices"
  },
  {
    "key": "fennel seed",
    "label": "Fennel seed",
    "aisle": "herbs-spices"
  },
  {
    "key": "mustard seed",
    "label": "Mustard seed",
    "aisle": "herbs-spices"
  },
  {
    "key": "caraway seed",
    "label": "Caraway seed",
    "aisle": "herbs-spices"
  },
  {
    "key": "nigella seed",
    "label": "Nigella seed",
    "aisle": "herbs-spices"
  },
  {
    "key": "celery salt",
    "label": "Celery salt",
    "aisle": "herbs-spices"
  },
  {
    "key": "garlic powder",
    "label": "Garlic powder",
    "aisle": "herbs-spices"
  },
  {
    "key": "onion powder",
    "label": "Onion powder",
    "aisle": "herbs-spices"
  },
  {
    "key": "saffron",
    "label": "Saffron",
    "aisle": "herbs-spices"
  },
  {
    "key": "vanilla extract",
    "label": "Vanilla extract",
    "aisle": "herbs-spices"
  },
  {
    "key": "vanilla pod",
    "label": "Vanilla pod",
    "aisle": "herbs-spices"
  },
  {
    "key": "sumac",
    "label": "Sumac",
    "aisle": "herbs-spices"
  },
  {
    "key": "zaatar",
    "label": "Zaatar",
    "aisle": "herbs-spices"
  },
  {
    "key": "ras el hanout",
    "label": "Ras el hanout",
    "aisle": "herbs-spices"
  },
  {
    "key": "jerk seasoning",
    "label": "Jerk seasoning",
    "aisle": "herbs-spices"
  },
  {
    "key": "fajita seasoning",
    "label": "Fajita seasoning",
    "aisle": "herbs-spices"
  },
  {
    "key": "italian seasoning",
    "label": "Italian seasoning",
    "aisle": "herbs-spices"
  },
  {
    "key": "chinese five spice",
    "label": "Chinese five spice",
    "aisle": "herbs-spices"
  },
  {
    "key": "cajun seasoning",
    "label": "Cajun seasoning",
    "aisle": "herbs-spices"
  },
  {
    "key": "piri piri seasoning",
    "label": "Piri piri seasoning",
    "aisle": "herbs-spices"
  },
  {
    "key": "curry leaf",
    "label": "Curry leaf",
    "aisle": "herbs-spices"
  },
  {
    "key": "asafoetida",
    "label": "Asafoetida",
    "aisle": "herbs-spices"
  },
  {
    "key": "juniper berry",
    "label": "Juniper berry",
    "aisle": "herbs-spices"
  },
  {
    "key": "ketchup",
    "label": "Ketchup",
    "aisle": "sauces-condiments"
  },
  {
    "key": "brown sauce",
    "label": "Brown sauce",
    "aisle": "sauces-condiments"
  },
  {
    "key": "mayonnaise",
    "label": "Mayonnaise",
    "aisle": "sauces-condiments"
  },
  {
    "key": "mustard",
    "label": "Mustard",
    "aisle": "sauces-condiments"
  },
  {
    "key": "dijon mustard",
    "label": "Dijon mustard",
    "aisle": "sauces-condiments"
  },
  {
    "key": "wholegrain mustard",
    "label": "Wholegrain mustard",
    "aisle": "sauces-condiments"
  },
  {
    "key": "english mustard",
    "label": "English mustard",
    "aisle": "sauces-condiments"
  },
  {
    "key": "american mustard",
    "label": "American mustard",
    "aisle": "sauces-condiments"
  },
  {
    "key": "worcestershire sauce",
    "label": "Worcestershire sauce",
    "aisle": "sauces-condiments"
  },
  {
    "key": "soy sauce",
    "label": "Soy sauce",
    "aisle": "sauces-condiments"
  },
  {
    "key": "dark soy sauce",
    "label": "Dark soy sauce",
    "aisle": "sauces-condiments"
  },
  {
    "key": "light soy sauce",
    "label": "Light soy sauce",
    "aisle": "sauces-condiments"
  },
  {
    "key": "fish sauce",
    "label": "Fish sauce",
    "aisle": "sauces-condiments"
  },
  {
    "key": "oyster sauce",
    "label": "Oyster sauce",
    "aisle": "sauces-condiments"
  },
  {
    "key": "hoisin sauce",
    "label": "Hoisin sauce",
    "aisle": "sauces-condiments"
  },
  {
    "key": "sriracha",
    "label": "Sriracha",
    "aisle": "sauces-condiments"
  },
  {
    "key": "tabasco",
    "label": "Tabasco",
    "aisle": "sauces-condiments"
  },
  {
    "key": "sauce",
    "label": "Hot sauce",
    "aisle": "sauces-condiments"
  },
  {
    "key": "sweet chilli sauce",
    "label": "Sweet chilli sauce",
    "aisle": "sauces-condiments"
  },
  {
    "key": "barbecue sauce",
    "label": "Barbecue sauce",
    "aisle": "sauces-condiments"
  },
  {
    "key": "pesto",
    "label": "Pesto",
    "aisle": "sauces-condiments"
  },
  {
    "key": "red pesto",
    "label": "Red pesto",
    "aisle": "sauces-condiments"
  },
  {
    "key": "pasta sauce",
    "label": "Pasta sauce",
    "aisle": "sauces-condiments"
  },
  {
    "key": "curry sauce",
    "label": "Curry sauce",
    "aisle": "sauces-condiments"
  },
  {
    "key": "horseradish sauce",
    "label": "Horseradish sauce",
    "aisle": "sauces-condiments"
  },
  {
    "key": "mint sauce",
    "label": "Mint sauce",
    "aisle": "sauces-condiments"
  },
  {
    "key": "cranberry sauce",
    "label": "Cranberry sauce",
    "aisle": "sauces-condiments"
  },
  {
    "key": "apple sauce",
    "label": "Apple sauce",
    "aisle": "sauces-condiments"
  },
  {
    "key": "tartare sauce",
    "label": "Tartare sauce",
    "aisle": "sauces-condiments"
  },
  {
    "key": "salad cream",
    "label": "Salad cream",
    "aisle": "sauces-condiments"
  },
  {
    "key": "salad dressing",
    "label": "Salad dressing",
    "aisle": "sauces-condiments"
  },
  {
    "key": "vinaigrette",
    "label": "Vinaigrette",
    "aisle": "sauces-condiments"
  },
  {
    "key": "caesar dressing",
    "label": "Caesar dressing",
    "aisle": "sauces-condiments"
  },
  {
    "key": "marmite",
    "label": "Marmite",
    "aisle": "sauces-condiments"
  },
  {
    "key": "chutney",
    "label": "Chutney",
    "aisle": "sauces-condiments"
  },
  {
    "key": "mango chutney",
    "label": "Mango chutney",
    "aisle": "sauces-condiments"
  },
  {
    "key": "piccalilli",
    "label": "Piccalilli",
    "aisle": "sauces-condiments"
  },
  {
    "key": "branston pickle",
    "label": "Branston pickle",
    "aisle": "sauces-condiments"
  },
  {
    "key": "jam",
    "label": "Jam",
    "aisle": "sauces-condiments"
  },
  {
    "key": "strawberry jam",
    "label": "Strawberry jam",
    "aisle": "sauces-condiments"
  },
  {
    "key": "raspberry jam",
    "label": "Raspberry jam",
    "aisle": "sauces-condiments"
  },
  {
    "key": "marmalade",
    "label": "Marmalade",
    "aisle": "sauces-condiments"
  },
  {
    "key": "honey",
    "label": "Honey",
    "aisle": "sauces-condiments"
  },
  {
    "key": "peanut butter",
    "label": "Peanut butter",
    "aisle": "sauces-condiments"
  },
  {
    "key": "chocolate spread",
    "label": "Chocolate spread",
    "aisle": "sauces-condiments"
  },
  {
    "key": "lemon curd",
    "label": "Lemon curd",
    "aisle": "sauces-condiments"
  },
  {
    "key": "golden syrup",
    "label": "Golden syrup",
    "aisle": "sauces-condiments"
  },
  {
    "key": "maple syrup",
    "label": "Maple syrup",
    "aisle": "sauces-condiments"
  },
  {
    "key": "treacle",
    "label": "Treacle",
    "aisle": "sauces-condiments"
  },
  {
    "key": "agave syrup",
    "label": "Agave syrup",
    "aisle": "sauces-condiments"
  },
  {
    "key": "thai red curry paste",
    "label": "Thai red curry paste",
    "aisle": "world-foods"
  },
  {
    "key": "thai green curry paste",
    "label": "Thai green curry paste",
    "aisle": "world-foods"
  },
  {
    "key": "korma paste",
    "label": "Korma paste",
    "aisle": "world-foods"
  },
  {
    "key": "tikka masala paste",
    "label": "Tikka masala paste",
    "aisle": "world-foods"
  },
  {
    "key": "rogan josh paste",
    "label": "Rogan josh paste",
    "aisle": "world-foods"
  },
  {
    "key": "curry paste",
    "label": "Curry paste",
    "aisle": "world-foods"
  },
  {
    "key": "harissa",
    "label": "Harissa",
    "aisle": "world-foods"
  },
  {
    "key": "gochujang",
    "label": "Gochujang",
    "aisle": "world-foods"
  },
  {
    "key": "miso paste",
    "label": "Miso paste",
    "aisle": "world-foods"
  },
  {
    "key": "tahini",
    "label": "Tahini",
    "aisle": "world-foods"
  },
  {
    "key": "wasabi",
    "label": "Wasabi",
    "aisle": "world-foods"
  },
  {
    "key": "mirin",
    "label": "Mirin",
    "aisle": "world-foods"
  },
  {
    "key": "rice wine",
    "label": "Rice wine",
    "aisle": "world-foods"
  },
  {
    "key": "sriracha mayo",
    "label": "Sriracha mayo",
    "aisle": "world-foods"
  },
  {
    "key": "kimchi",
    "label": "Kimchi",
    "aisle": "world-foods"
  },
  {
    "key": "nori",
    "label": "Nori",
    "aisle": "world-foods"
  },
  {
    "key": "panko breadcrumb",
    "label": "Panko breadcrumbs",
    "aisle": "world-foods"
  },
  {
    "key": "rice paper",
    "label": "Rice paper",
    "aisle": "world-foods"
  },
  {
    "key": "tortilla chip",
    "label": "Tortilla chips",
    "aisle": "world-foods"
  },
  {
    "key": "taco shell",
    "label": "Taco shell",
    "aisle": "world-foods"
  },
  {
    "key": "chipotle paste",
    "label": "Chipotle paste",
    "aisle": "world-foods"
  },
  {
    "key": "jerk paste",
    "label": "Jerk paste",
    "aisle": "world-foods"
  },
  {
    "key": "pomegranate molasses",
    "label": "Pomegranate molasses",
    "aisle": "world-foods"
  },
  {
    "key": "preserved lemon",
    "label": "Preserved lemon",
    "aisle": "world-foods"
  },
  {
    "key": "rose harissa",
    "label": "Rose harissa",
    "aisle": "world-foods"
  },
  {
    "key": "dashi",
    "label": "Dashi",
    "aisle": "world-foods"
  },
  {
    "key": "coconut amino",
    "label": "Coconut aminos",
    "aisle": "world-foods"
  },
  {
    "key": "tamarind paste",
    "label": "Tamarind paste",
    "aisle": "world-foods"
  },
  {
    "key": "yuzu juice",
    "label": "Yuzu juice",
    "aisle": "world-foods"
  },
  {
    "key": "plain flour",
    "label": "Plain flour",
    "aisle": "baking"
  },
  {
    "key": "self raising flour",
    "label": "Self-raising flour",
    "aisle": "baking"
  },
  {
    "key": "strong bread flour",
    "label": "Strong bread flour",
    "aisle": "baking"
  },
  {
    "key": "wholemeal flour",
    "label": "Wholemeal flour",
    "aisle": "baking"
  },
  {
    "key": "cornflour",
    "label": "Cornflour",
    "aisle": "baking"
  },
  {
    "key": "flour",
    "label": "Gram flour",
    "aisle": "baking"
  },
  {
    "key": "baking powder",
    "label": "Baking powder",
    "aisle": "baking"
  },
  {
    "key": "bicarbonate soda",
    "label": "Bicarbonate of soda",
    "aisle": "baking"
  },
  {
    "key": "dried yeast",
    "label": "Dried yeast",
    "aisle": "baking"
  },
  {
    "key": "fast action yeast",
    "label": "Fast action yeast",
    "aisle": "baking"
  },
  {
    "key": "caster sugar",
    "label": "Caster sugar",
    "aisle": "baking"
  },
  {
    "key": "golden caster sugar",
    "label": "Golden caster sugar",
    "aisle": "baking"
  },
  {
    "key": "granulated sugar",
    "label": "Granulated sugar",
    "aisle": "baking"
  },
  {
    "key": "icing sugar",
    "label": "Icing sugar",
    "aisle": "baking"
  },
  {
    "key": "light brown sugar",
    "label": "Light brown sugar",
    "aisle": "baking"
  },
  {
    "key": "dark brown sugar",
    "label": "Dark brown sugar",
    "aisle": "baking"
  },
  {
    "key": "demerara sugar",
    "label": "Demerara sugar",
    "aisle": "baking"
  },
  {
    "key": "muscovado sugar",
    "label": "Muscovado sugar",
    "aisle": "baking"
  },
  {
    "key": "cocoa powder",
    "label": "Cocoa powder",
    "aisle": "baking"
  },
  {
    "key": "dark chocolate",
    "label": "Dark chocolate",
    "aisle": "baking"
  },
  {
    "key": "milk chocolate",
    "label": "Milk chocolate",
    "aisle": "baking"
  },
  {
    "key": "white chocolate",
    "label": "White chocolate",
    "aisle": "baking"
  },
  {
    "key": "chocolate chip",
    "label": "Chocolate chip",
    "aisle": "baking"
  },
  {
    "key": "ground almond",
    "label": "Ground almond",
    "aisle": "baking"
  },
  {
    "key": "desiccated coconut",
    "label": "Desiccated coconut",
    "aisle": "baking"
  },
  {
    "key": "raisin",
    "label": "Raisin",
    "aisle": "baking"
  },
  {
    "key": "sultana",
    "label": "Sultana",
    "aisle": "baking"
  },
  {
    "key": "currant",
    "label": "Currant",
    "aisle": "baking"
  },
  {
    "key": "date",
    "label": "Date",
    "aisle": "baking"
  },
  {
    "key": "dried apricot",
    "label": "Dried apricot",
    "aisle": "baking"
  },
  {
    "key": "dried cranberry",
    "label": "Dried cranberry",
    "aisle": "baking"
  },
  {
    "key": "dried mixed fruit",
    "label": "Dried mixed fruit",
    "aisle": "baking"
  },
  {
    "key": "glace cherry",
    "label": "Glace cherry",
    "aisle": "baking"
  },
  {
    "key": "mixed peel",
    "label": "Mixed peel",
    "aisle": "baking"
  },
  {
    "key": "almond",
    "label": "Almond",
    "aisle": "baking"
  },
  {
    "key": "flaked almond",
    "label": "Flaked almond",
    "aisle": "baking"
  },
  {
    "key": "walnut",
    "label": "Walnut",
    "aisle": "baking"
  },
  {
    "key": "pecan",
    "label": "Pecan",
    "aisle": "baking"
  },
  {
    "key": "hazelnut",
    "label": "Hazelnut",
    "aisle": "baking"
  },
  {
    "key": "cashew",
    "label": "Cashew",
    "aisle": "baking"
  },
  {
    "key": "pistachio",
    "label": "Pistachio",
    "aisle": "baking"
  },
  {
    "key": "pine nut",
    "label": "Pine nut",
    "aisle": "baking"
  },
  {
    "key": "peanut",
    "label": "Peanut",
    "aisle": "baking"
  },
  {
    "key": "mixed nut",
    "label": "Mixed nuts",
    "aisle": "baking"
  },
  {
    "key": "sunflower seed",
    "label": "Sunflower seed",
    "aisle": "baking"
  },
  {
    "key": "pumpkin seed",
    "label": "Pumpkin seed",
    "aisle": "baking"
  },
  {
    "key": "sesame seed",
    "label": "Sesame seed",
    "aisle": "baking"
  },
  {
    "key": "chia seed",
    "label": "Chia seed",
    "aisle": "baking"
  },
  {
    "key": "flaxseed",
    "label": "Flaxseed",
    "aisle": "baking"
  },
  {
    "key": "poppy seed",
    "label": "Poppy seed",
    "aisle": "baking"
  },
  {
    "key": "gelatine",
    "label": "Gelatine",
    "aisle": "baking"
  },
  {
    "key": "food colouring",
    "label": "Food colouring",
    "aisle": "baking"
  },
  {
    "key": "icing decoration",
    "label": "Icing decorations",
    "aisle": "baking"
  },
  {
    "key": "marzipan",
    "label": "Marzipan",
    "aisle": "baking"
  },
  {
    "key": "fondant icing",
    "label": "Fondant icing",
    "aisle": "baking"
  },
  {
    "key": "breadcrumb",
    "label": "Breadcrumbs",
    "aisle": "baking"
  },
  {
    "key": "suet",
    "label": "Suet",
    "aisle": "baking"
  },
  {
    "key": "mincemeat",
    "label": "Mincemeat",
    "aisle": "baking"
  },
  {
    "key": "almond extract",
    "label": "Almond extract",
    "aisle": "baking"
  },
  {
    "key": "cake mix",
    "label": "Cake mix",
    "aisle": "baking"
  },
  {
    "key": "cornflake",
    "label": "Cornflakes",
    "aisle": "breakfast-cereals"
  },
  {
    "key": "bran flake",
    "label": "Bran flakes",
    "aisle": "breakfast-cereals"
  },
  {
    "key": "muesli",
    "label": "Muesli",
    "aisle": "breakfast-cereals"
  },
  {
    "key": "granola",
    "label": "Granola",
    "aisle": "breakfast-cereals"
  },
  {
    "key": "weetabix",
    "label": "Weetabix",
    "aisle": "breakfast-cereals"
  },
  {
    "key": "wheat",
    "label": "Shredded wheat",
    "aisle": "breakfast-cereals"
  },
  {
    "key": "rice krispy",
    "label": "Rice krispies",
    "aisle": "breakfast-cereals"
  },
  {
    "key": "cheerio",
    "label": "Cheerios",
    "aisle": "breakfast-cereals"
  },
  {
    "key": "breakfast cereal",
    "label": "Breakfast cereal",
    "aisle": "breakfast-cereals"
  },
  {
    "key": "cereal bar",
    "label": "Cereal bar",
    "aisle": "breakfast-cereals"
  },
  {
    "key": "crunchy nut cornflake",
    "label": "Crunchy nut cornflakes",
    "aisle": "breakfast-cereals"
  },
  {
    "key": "crisp",
    "label": "Crisps",
    "aisle": "snacks-confectionery"
  },
  {
    "key": "popcorn",
    "label": "Popcorn",
    "aisle": "snacks-confectionery"
  },
  {
    "key": "pretzel",
    "label": "Pretzel",
    "aisle": "snacks-confectionery"
  },
  {
    "key": "salted peanut",
    "label": "Salted peanuts",
    "aisle": "snacks-confectionery"
  },
  {
    "key": "biscuit",
    "label": "Biscuit",
    "aisle": "snacks-confectionery"
  },
  {
    "key": "digestive biscuit",
    "label": "Digestive biscuit",
    "aisle": "snacks-confectionery"
  },
  {
    "key": "chocolate biscuit",
    "label": "Chocolate biscuit",
    "aisle": "snacks-confectionery"
  },
  {
    "key": "cracker",
    "label": "Cracker",
    "aisle": "snacks-confectionery"
  },
  {
    "key": "oatcake",
    "label": "Oatcake",
    "aisle": "snacks-confectionery"
  },
  {
    "key": "rice cake",
    "label": "Rice cake",
    "aisle": "snacks-confectionery"
  },
  {
    "key": "breadstick",
    "label": "Breadstick",
    "aisle": "snacks-confectionery"
  },
  {
    "key": "chocolate bar",
    "label": "Chocolate bar",
    "aisle": "snacks-confectionery"
  },
  {
    "key": "sweet",
    "label": "Sweets",
    "aisle": "snacks-confectionery"
  },
  {
    "key": "poppadom",
    "label": "Poppadom",
    "aisle": "snacks-confectionery"
  },
  {
    "key": "tortilla crisp",
    "label": "Tortilla crisps",
    "aisle": "snacks-confectionery"
  },
  {
    "key": "orange juice",
    "label": "Orange juice",
    "aisle": "soft-drinks"
  },
  {
    "key": "apple juice",
    "label": "Apple juice",
    "aisle": "soft-drinks"
  },
  {
    "key": "cranberry juice",
    "label": "Cranberry juice",
    "aisle": "soft-drinks"
  },
  {
    "key": "tomato juice",
    "label": "Tomato juice",
    "aisle": "soft-drinks"
  },
  {
    "key": "lemonade",
    "label": "Lemonade",
    "aisle": "soft-drinks"
  },
  {
    "key": "cola",
    "label": "Cola",
    "aisle": "soft-drinks"
  },
  {
    "key": "sparkling water",
    "label": "Sparkling water",
    "aisle": "soft-drinks"
  },
  {
    "key": "still water",
    "label": "Still water",
    "aisle": "soft-drinks"
  },
  {
    "key": "tonic water",
    "label": "Tonic water",
    "aisle": "soft-drinks"
  },
  {
    "key": "ginger beer",
    "label": "Ginger beer",
    "aisle": "soft-drinks"
  },
  {
    "key": "ginger ale",
    "label": "Ginger ale",
    "aisle": "soft-drinks"
  },
  {
    "key": "squash",
    "label": "Squash",
    "aisle": "soft-drinks"
  },
  {
    "key": "cordial",
    "label": "Cordial",
    "aisle": "soft-drinks"
  },
  {
    "key": "elderflower cordial",
    "label": "Elderflower cordial",
    "aisle": "soft-drinks"
  },
  {
    "key": "coconut water",
    "label": "Coconut water",
    "aisle": "soft-drinks"
  },
  {
    "key": "energy drink",
    "label": "Energy drink",
    "aisle": "soft-drinks"
  },
  {
    "key": "iced tea",
    "label": "Iced tea",
    "aisle": "soft-drinks"
  },
  {
    "key": "tea",
    "label": "Tea bag",
    "aisle": "tea-coffee"
  },
  {
    "key": "green tea",
    "label": "Green tea",
    "aisle": "tea-coffee"
  },
  {
    "key": "herbal tea",
    "label": "Herbal tea",
    "aisle": "tea-coffee"
  },
  {
    "key": "earl grey",
    "label": "Earl grey",
    "aisle": "tea-coffee"
  },
  {
    "key": "peppermint tea",
    "label": "Peppermint tea",
    "aisle": "tea-coffee"
  },
  {
    "key": "chai tea",
    "label": "Chai tea",
    "aisle": "tea-coffee"
  },
  {
    "key": "coffee",
    "label": "Coffee",
    "aisle": "tea-coffee"
  },
  {
    "key": "ground coffee",
    "label": "Ground coffee",
    "aisle": "tea-coffee"
  },
  {
    "key": "coffee bean",
    "label": "Coffee beans",
    "aisle": "tea-coffee"
  },
  {
    "key": "instant coffee",
    "label": "Instant coffee",
    "aisle": "tea-coffee"
  },
  {
    "key": "chocolate",
    "label": "Hot chocolate",
    "aisle": "tea-coffee"
  },
  {
    "key": "drinking chocolate",
    "label": "Drinking chocolate",
    "aisle": "tea-coffee"
  },
  {
    "key": "matcha powder",
    "label": "Matcha powder",
    "aisle": "tea-coffee"
  },
  {
    "key": "red wine",
    "label": "Red wine",
    "aisle": "alcohol"
  },
  {
    "key": "white wine",
    "label": "White wine",
    "aisle": "alcohol"
  },
  {
    "key": "rose wine",
    "label": "Rose wine",
    "aisle": "alcohol"
  },
  {
    "key": "prosecco",
    "label": "Prosecco",
    "aisle": "alcohol"
  },
  {
    "key": "champagne",
    "label": "Champagne",
    "aisle": "alcohol"
  },
  {
    "key": "beer",
    "label": "Beer",
    "aisle": "alcohol"
  },
  {
    "key": "lager",
    "label": "Lager",
    "aisle": "alcohol"
  },
  {
    "key": "ale",
    "label": "Ale",
    "aisle": "alcohol"
  },
  {
    "key": "stout",
    "label": "Stout",
    "aisle": "alcohol"
  },
  {
    "key": "cider",
    "label": "Cider",
    "aisle": "alcohol"
  },
  {
    "key": "vodka",
    "label": "Vodka",
    "aisle": "alcohol"
  },
  {
    "key": "gin",
    "label": "Gin",
    "aisle": "alcohol"
  },
  {
    "key": "rum",
    "label": "Rum",
    "aisle": "alcohol"
  },
  {
    "key": "whisky",
    "label": "Whisky",
    "aisle": "alcohol"
  },
  {
    "key": "brandy",
    "label": "Brandy",
    "aisle": "alcohol"
  },
  {
    "key": "sherry",
    "label": "Sherry",
    "aisle": "alcohol"
  },
  {
    "key": "port",
    "label": "Port",
    "aisle": "alcohol"
  },
  {
    "key": "marsala wine",
    "label": "Marsala wine",
    "aisle": "alcohol"
  },
  {
    "key": "sake",
    "label": "Sake",
    "aisle": "alcohol"
  },
  {
    "key": "vermouth",
    "label": "Vermouth",
    "aisle": "alcohol"
  },
  {
    "key": "triple sec",
    "label": "Triple sec",
    "aisle": "alcohol"
  },
  {
    "key": "cooking wine",
    "label": "Cooking wine",
    "aisle": "alcohol"
  },
  {
    "key": "kitchen roll",
    "label": "Kitchen roll",
    "aisle": "household"
  },
  {
    "key": "toilet roll",
    "label": "Toilet roll",
    "aisle": "household"
  },
  {
    "key": "washing up liquid",
    "label": "Washing up liquid",
    "aisle": "household"
  },
  {
    "key": "dishwasher tablet",
    "label": "Dishwasher tablet",
    "aisle": "household"
  },
  {
    "key": "laundry detergent",
    "label": "Laundry detergent",
    "aisle": "household"
  },
  {
    "key": "fabric softener",
    "label": "Fabric softener",
    "aisle": "household"
  },
  {
    "key": "bin",
    "label": "Bin bag",
    "aisle": "household"
  },
  {
    "key": "cling film",
    "label": "Cling film",
    "aisle": "household"
  },
  {
    "key": "foil",
    "label": "Tin foil",
    "aisle": "household"
  },
  {
    "key": "baking paper",
    "label": "Baking paper",
    "aisle": "household"
  },
  {
    "key": "sandwich",
    "label": "Sandwich bag",
    "aisle": "household"
  },
  {
    "key": "sponge",
    "label": "Sponge",
    "aisle": "household"
  },
  {
    "key": "surface cleaner",
    "label": "Surface cleaner",
    "aisle": "household"
  },
  {
    "key": "bleach",
    "label": "Bleach",
    "aisle": "household"
  },
  {
    "key": "freezer",
    "label": "Freezer bag",
    "aisle": "household"
  },
  {
    "key": "kitchen towel",
    "label": "Kitchen towel",
    "aisle": "household"
  },
  {
    "key": "battery",
    "label": "Batteries",
    "aisle": "household"
  },
  {
    "key": "light bulb",
    "label": "Light bulb",
    "aisle": "household"
  },
  {
    "key": "toothpaste",
    "label": "Toothpaste",
    "aisle": "health-beauty"
  },
  {
    "key": "shampoo",
    "label": "Shampoo",
    "aisle": "health-beauty"
  },
  {
    "key": "conditioner",
    "label": "Conditioner",
    "aisle": "health-beauty"
  },
  {
    "key": "shower gel",
    "label": "Shower gel",
    "aisle": "health-beauty"
  },
  {
    "key": "hand soap",
    "label": "Hand soap",
    "aisle": "health-beauty"
  },
  {
    "key": "deodorant",
    "label": "Deodorant",
    "aisle": "health-beauty"
  },
  {
    "key": "razor",
    "label": "Razor",
    "aisle": "health-beauty"
  },
  {
    "key": "paracetamol",
    "label": "Paracetamol",
    "aisle": "health-beauty"
  },
  {
    "key": "ibuprofen",
    "label": "Ibuprofen",
    "aisle": "health-beauty"
  },
  {
    "key": "plaster",
    "label": "Plaster",
    "aisle": "health-beauty"
  },
  {
    "key": "sun cream",
    "label": "Sun cream",
    "aisle": "health-beauty"
  },
  {
    "key": "moisturiser",
    "label": "Moisturiser",
    "aisle": "health-beauty"
  },
  {
    "key": "cotton wool",
    "label": "Cotton wool",
    "aisle": "health-beauty"
  }
];

module.exports = { INGREDIENT_AISLE_SEED, AISLES };
