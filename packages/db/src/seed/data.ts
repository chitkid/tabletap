import type { Allergen, PlateKind, StaffRole } from '@tabletap/shared';

export const DEMO_RESTAURANT_SLUG = 'little-furnace';
/**
 * The name and the slug do not change with the language. «Little Furnace» is the wordmark, the
 * brand guidelines are drawn around it, and the slug is hashed into every seeded table id and so
 * into every printed QR token — a rename would invalidate all three to say in Russian what the sign
 * over the door already says in Latin. A Moscow café with an English sign is ordinary.
 *
 * The currency and the timezone do change, because those are facts about where it stands: it takes
 * roubles and its day ends at Moscow midnight. `0007_overconfident_dust.sql` already moved the
 * column defaults; this row was still writing its own `'USD'` over them.
 */
export const DEMO_RESTAURANT = {
  name: 'Little Furnace',
  slug: DEMO_RESTAURANT_SLUG,
  currency: 'RUB',
  timezone: 'Europe/Moscow',
} as const;

/**
 * A plain space in «Стол 7», not U+00A0. The admin's table list hides a label that only repeats
 * the number it already prints, and it compares the two with the whitespace flattened precisely
 * because the dictionary binds «Стол 7» with a non-breaking space while a label typed by a person —
 * or written here — does not (`apps/web/components/admin/tables-table.tsx`).
 */
export const DEMO_TABLES: ReadonlyArray<{ number: number; label: string; seats: number }> =
  Array.from({ length: 12 }, (_, i) => ({
    number: i + 1,
    label: `Стол ${i + 1}`,
    seats: [2, 2, 4, 4, 4, 6, 2, 4, 4, 6, 2, 4][i]!,
  }));

export interface SeedItem {
  name: string;
  description: string;
  /** Integer kopecks, the same integer minor unit the column has always held. 69000 is 690 ₽. */
  priceCents: number;
  allergens: Allergen[];
  isAvailable?: boolean;
}
export interface SeedCategory {
  /**
   * The category's stable identity, never shown to anyone. Row ids are hashed from it rather than
   * from `name`, so the menu can be re-worded — or translated again — without every category and
   * every dish under it changing id.
   */
  key: string;
  name: string;
  /**
   * Declared, not inferred. The demo carries no photographs, so this is the only thing that decides
   * what a dish looks like; it used to be guessed in the browser from `name`, which worked for as
   * long as the categories were English words the guesser knew.
   */
  plateKind: PlateKind;
  items: SeedItem[];
}

/**
 * A café in Moscow that cooks over fire: a tandoor and an oven, so lepyoshki and khachapuri, pots
 * and pilaf, salads built on baked vegetables. Not the English menu with Russian words over it —
 * the prices are what such a place charges (coffee 250–350 ₽, salads 450–650 ₽, mains 700–1 200 ₽)
 * rather than dollars at some rate, and the dishes are ones a guest here would expect to find.
 *
 * The four categories draw four different plates. That is a property with a test behind it
 * (`data.test.ts`), because a menu whose every dish is the same shape is the failure this file's
 * `plateKind` exists to prevent, and it is invisible to every other test in the repository.
 */
export const DEMO_MENU: ReadonlyArray<SeedCategory> = [
  {
    key: 'from-the-oven',
    name: 'Из печи',
    plateKind: 'flatbread',
    items: [
      {
        name: 'Хачапури по-аджарски',
        description: 'Лодочка из теста, сулугуни, желток, кусок сливочного масла.',
        priceCents: 69000,
        allergens: ['gluten', 'dairy', 'egg'],
      },
      {
        name: 'Лепёшка с бараниной и зирой',
        description: 'Тонкое тесто, рубленая баранина, лук, зира.',
        priceCents: 62000,
        allergens: ['gluten'],
      },
      {
        name: 'Лепёшка с грибами и сулугуни',
        description: 'Шампиньоны, сулугуни, тимьян.',
        priceCents: 58000,
        allergens: ['gluten', 'dairy'],
      },
      {
        name: 'Пирог с судаком и луком',
        description: 'Речная рыба, много лука, чёрный перец.',
        priceCents: 64000,
        allergens: ['gluten', 'fish'],
      },
      {
        name: 'Пирог с капустой и яйцом',
        description: 'Дрожжевое тесто, тушёная капуста, яйцо, укроп.',
        priceCents: 42000,
        allergens: ['gluten', 'egg'],
      },
      {
        name: 'Тандырная лепёшка',
        description: 'Простая и горячая, с хрустящей коркой. К любому горячему.',
        priceCents: 18000,
        allergens: ['gluten'],
      },
    ],
  },
  {
    key: 'hot-dishes',
    name: 'Горячее',
    plateKind: 'bowl',
    items: [
      {
        name: 'Плов с бараниной',
        description: 'Рис девзира, баранина, жёлтая морковь, головка чеснока.',
        priceCents: 89000,
        allergens: [],
      },
      {
        name: 'Жаркое в горшочке',
        description: 'Говядина, картофель, белые грибы, сметана.',
        priceCents: 94000,
        allergens: ['dairy'],
      },
      {
        name: 'Уха из судака на углях',
        description: 'Судак, картофель, печёные на дровах овощи.',
        priceCents: 78000,
        allergens: ['fish'],
      },
      {
        name: 'Гречка с белыми грибами',
        description: 'Гречка из печи, белые грибы, жареный лук, сливочное масло.',
        priceCents: 72000,
        allergens: ['dairy'],
      },
      {
        name: 'Рагу из телятины с айвой',
        description: 'Телятина, айва, тимьян, печёный лук.',
        priceCents: 118000,
        allergens: [],
      },
    ],
  },
  {
    key: 'starters',
    name: 'Салаты и закуски',
    plateKind: 'side',
    items: [
      {
        name: 'Свёкла из печи с адыгейским сыром',
        description: 'Печёная свёкла, адыгейский сыр, грецкий орех, мёд.',
        priceCents: 56000,
        allergens: ['dairy', 'nuts'],
      },
      {
        name: 'Баклажаны с ореховым соусом',
        description: 'Печёные баклажаны, ореховый соус, гранат, кинза.',
        priceCents: 54000,
        allergens: ['nuts'],
        // The one dish the guest menu draws as sold out, and the seeded example the order route's
        // «этого уже нет» path is written against.
        isAvailable: false,
      },
      {
        name: 'Сельдь с печёным картофелем',
        description: 'Сельдь, картофель из печи, красный лук, чёрный хлеб.',
        priceCents: 52000,
        allergens: ['fish', 'gluten'],
      },
      {
        name: 'Томаты с красным луком',
        description: 'Бакинские томаты, красный лук, кинза, нерафинированное масло.',
        priceCents: 48000,
        allergens: [],
      },
      {
        name: 'Соленья из бочки',
        description: 'Огурцы, квашеная капуста, черемша, лук с маслом.',
        priceCents: 32000,
        allergens: [],
      },
    ],
  },
  {
    key: 'drinks',
    name: 'Напитки',
    plateKind: 'drink',
    items: [
      {
        name: 'Капучино',
        description: 'Двойной эспрессо, молоко.',
        priceCents: 29000,
        allergens: ['dairy'],
      },
      {
        name: 'Раф с облепихой',
        description: 'Эспрессо, сливки, облепиха.',
        priceCents: 34000,
        allergens: ['dairy'],
      },
      {
        name: 'Чай с чабрецом',
        description: 'Чабрец, мята, чайник на двоих.',
        priceCents: 30000,
        allergens: [],
      },
      {
        name: 'Морс из клюквы',
        description: 'Клюква, вода, немного мёда.',
        priceCents: 26000,
        allergens: [],
      },
    ],
  },
];

/**
 * The addresses do not change with the names. A local part is the role («вход как кухня»), the
 * domain is the demo tenant, and both are the account identity: they are typed into the sign-in
 * form in the README, filled in by `/login?demo=<role>`, and hard-coded as the sign-in identity in
 * roughly twenty test files and the Playwright suite. Transliterating them would buy nothing a
 * guest or an operator ever reads and break every one of those. The names are what a person is
 * called on screen — «Вы вошли как…», the kitchen's own header — so those are Russian.
 */
export const DEMO_STAFF: ReadonlyArray<{ email: string; name: string; role: StaffRole }> = [
  { email: 'admin@littlefurnace.demo', name: 'Марина Ковалёва', role: 'admin' },
  { email: 'kitchen@littlefurnace.demo', name: 'Тимофей Басов', role: 'kitchen' },
  { email: 'waiter@littlefurnace.demo', name: 'Юлия Окулова', role: 'waiter' },
];
