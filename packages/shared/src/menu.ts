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
