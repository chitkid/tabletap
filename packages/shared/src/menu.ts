import { z } from 'zod';
export const ALLERGENS = [
  'gluten',
  'dairy',
  'egg',
  'fish',
  'shellfish',
  'nuts',
  'peanuts',
  'soy',
  'sesame',
] as const;
export type Allergen = (typeof ALLERGENS)[number];
export const AllergenSchema = z.enum(ALLERGENS);

/**
 * How a dish with no photograph is drawn (`packages/ui`'s `Plate`): the four compositions the
 * plate planner knows how to build.
 *
 * It lives here, beside the allergens, rather than in `packages/ui`, because three packages need
 * the same four words and only one of them draws anything: the seed declares a kind per category,
 * the database stores it, the API carries it on `MenuCategoryDto`, and the browser draws it. It
 * used to be guessed in the browser from the category's display name — `'Flatbreads'` contains
 * "flatbread", so it drew a flatbread — which meant renaming a category to «Из печи» silently
 * dropped every dish onto the fallback shape with no test to notice. A kind is data now, declared
 * once where the category is, and a category's name is free to be whatever a restaurant calls it.
 */
export const PLATE_KINDS = ['flatbread', 'bowl', 'side', 'drink'] as const;
export type PlateKind = (typeof PLATE_KINDS)[number];
export const PlateKindSchema = z.enum(PLATE_KINDS);
/**
 * What a category that never declared a kind is drawn as — the column's default, and so the shape
 * a category created through the admin editor gets. Named, rather than written as a bare `'side'`
 * at each site, so a test can assert that a seeded category is *not* this.
 */
export const DEFAULT_PLATE_KIND: PlateKind = 'side';
