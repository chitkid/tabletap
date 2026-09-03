import type { Allergen, StaffRole } from '@tabletap/shared';

export const DEMO_RESTAURANT_SLUG = 'little-furnace';
export const DEMO_RESTAURANT = {
  name: 'Little Furnace',
  slug: DEMO_RESTAURANT_SLUG,
  currency: 'USD',
  timezone: 'Europe/Lisbon',
} as const;

export const DEMO_TABLES: ReadonlyArray<{ number: number; label: string; seats: number }> =
  Array.from({ length: 12 }, (_, i) => ({
    number: i + 1,
    label: `Table ${i + 1}`,
    seats: [2, 2, 4, 4, 4, 6, 2, 4, 4, 6, 2, 4][i]!,
  }));

export interface SeedItem {
  name: string;
  description: string;
  priceCents: number;
  allergens: Allergen[];
  isAvailable?: boolean;
}
export const DEMO_MENU: ReadonlyArray<{ category: string; items: SeedItem[] }> = [
  {
    category: 'Flatbreads',
    items: [
      {
        name: 'Margherita Flatbread',
        description: 'Tomato, fior di latte, basil.',
        priceCents: 1200,
        allergens: ['gluten', 'dairy'],
      },
      {
        name: 'Fennel Sausage & Honey',
        description: 'Fennel sausage, chili honey, pecorino.',
        priceCents: 1500,
        allergens: ['gluten', 'dairy'],
      },
      {
        name: 'Mushroom & Taleggio',
        description: 'Roast mushrooms, taleggio, thyme.',
        priceCents: 1400,
        allergens: ['gluten', 'dairy'],
      },
      {
        name: 'Charred Pepper & Olive',
        description: 'Charred peppers, olives, salsa verde. Vegan.',
        priceCents: 1300,
        allergens: ['gluten'],
      },
      {
        name: 'Prosciutto & Rocket',
        description: 'Prosciutto, rocket, parmesan, lemon.',
        priceCents: 1600,
        allergens: ['gluten', 'dairy'],
      },
      {
        name: 'Smoked Chili & Egg',
        description: 'Smoked chili, soft egg, spring onion.',
        priceCents: 1400,
        allergens: ['gluten', 'egg', 'dairy'],
      },
    ],
  },
  {
    category: 'Bowls',
    items: [
      {
        name: 'Roast Chicken Grain Bowl',
        description: 'Farro, roast chicken, greens, tahini.',
        priceCents: 1400,
        allergens: ['gluten'],
      },
      {
        name: 'Ember Salmon Bowl',
        description: 'Fire-roasted salmon, rice, pickles, sesame.',
        priceCents: 1700,
        allergens: ['fish', 'sesame'],
      },
      {
        name: 'Harissa Chickpea Bowl',
        description: 'Harissa chickpeas, roast roots, tahini. Vegan.',
        priceCents: 1200,
        allergens: ['sesame'],
      },
      {
        name: 'Lamb Meatball Bowl',
        description: 'Lamb meatballs, bulgur, yoghurt, mint.',
        priceCents: 1600,
        allergens: ['gluten', 'dairy'],
      },
      {
        name: 'Roast Squash & Feta',
        description: 'Roast squash, feta, toasted seeds, walnuts.',
        priceCents: 1300,
        allergens: ['dairy', 'nuts'],
      },
    ],
  },
  {
    category: 'Sides',
    items: [
      {
        name: 'Blistered Greens',
        description: 'Seasonal greens, garlic, lemon.',
        priceCents: 600,
        allergens: [],
      },
      {
        name: 'Furnace Potatoes',
        description: 'Crisp potatoes from the oven floor, rosemary salt.',
        priceCents: 700,
        allergens: [],
      },
      {
        name: 'Burrata & Peaches',
        description: 'Burrata, grilled peaches, basil oil.',
        priceCents: 1100,
        allergens: ['dairy'],
        isAvailable: false,
      },
      {
        name: 'Wood-Fired Focaccia',
        description: 'Focaccia, olive oil, flaky salt.',
        priceCents: 500,
        allergens: ['gluten'],
      },
      {
        name: 'Marinated Olives',
        description: 'Olives, orange peel, fennel seed.',
        priceCents: 500,
        allergens: [],
      },
    ],
  },
  {
    category: 'Drinks',
    items: [
      {
        name: 'House Lemonade',
        description: 'Lemon, a little honey, soda.',
        priceCents: 400,
        allergens: [],
      },
      { name: 'Sparkling Water', description: '500 ml.', priceCents: 300, allergens: [] },
      {
        name: 'Cold Brew',
        description: 'Slow-steeped, served over ice.',
        priceCents: 450,
        allergens: [],
      },
      {
        name: 'Blood Orange Soda',
        description: 'Blood orange, soda, ice.',
        priceCents: 400,
        allergens: [],
      },
    ],
  },
];

export const DEMO_STAFF: ReadonlyArray<{ email: string; name: string; role: StaffRole }> = [
  { email: 'admin@littlefurnace.demo', name: 'Mara Quinn', role: 'admin' },
  { email: 'kitchen@littlefurnace.demo', name: 'Theo Baptiste', role: 'kitchen' },
  { email: 'waiter@littlefurnace.demo', name: 'Jun Okafor', role: 'waiter' },
];
