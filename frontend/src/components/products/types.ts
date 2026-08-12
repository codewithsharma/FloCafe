export type ProductsTabType = 'products' | 'categories' | 'addons';

export const PRESET_TAGS = [
  { key: 'veg', labelKey: 'pos.tagVeg' },
  { key: 'non_veg', labelKey: 'pos.tagNonVeg' },
  { key: 'vegan', labelKey: 'pos.tagVegan' },
  { key: 'egg', labelKey: 'pos.tagEgg' },
  { key: 'spicy', labelKey: 'pos.tagSpicy' },
  { key: 'contains_nuts', labelKey: 'pos.tagContainsNuts' },
  { key: 'gluten_free', labelKey: 'pos.tagGlutenFree' },
  { key: 'dairy_free', labelKey: 'pos.tagDairyFree' },
  { key: 'new_arrival', labelKey: 'pos.tagNewArrival' },
  { key: 'bestseller', labelKey: 'pos.tagBestseller' },
  { key: 'organic', labelKey: 'pos.tagOrganic' },
  { key: 'fragrance_free', labelKey: 'pos.tagFragranceFree' },
  { key: 'limited', labelKey: 'pos.tagLimited' },
] as const;

export const CATEGORY_COLORS = [
  { key: '', labelKey: 'products.colorNone', bg: 'bg-gray-100', text: 'text-gray-600' },
  { key: 'red', labelKey: 'products.colorRed', bg: 'bg-red-100', text: 'text-red-700' },
  { key: 'orange', labelKey: 'products.colorOrange', bg: 'bg-orange-100', text: 'text-orange-700' },
  { key: 'amber', labelKey: 'products.colorAmber', bg: 'bg-amber-100', text: 'text-amber-700' },
  { key: 'yellow', labelKey: 'products.colorYellow', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  { key: 'lime', labelKey: 'products.colorLime', bg: 'bg-lime-100', text: 'text-lime-700' },
  { key: 'green', labelKey: 'products.colorGreen', bg: 'bg-green-100', text: 'text-green-700' },
  { key: 'emerald', labelKey: 'products.colorEmerald', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { key: 'teal', labelKey: 'products.colorTeal', bg: 'bg-teal-100', text: 'text-teal-700' },
  { key: 'cyan', labelKey: 'products.colorCyan', bg: 'bg-cyan-100', text: 'text-cyan-700' },
  { key: 'sky', labelKey: 'products.colorSky', bg: 'bg-sky-100', text: 'text-sky-700' },
  { key: 'blue', labelKey: 'products.colorBlue', bg: 'bg-blue-100', text: 'text-blue-700' },
  { key: 'indigo', labelKey: 'products.colorIndigo', bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { key: 'violet', labelKey: 'products.colorViolet', bg: 'bg-violet-100', text: 'text-violet-700' },
  { key: 'purple', labelKey: 'products.colorPurple', bg: 'bg-purple-100', text: 'text-purple-700' },
  { key: 'fuchsia', labelKey: 'products.colorFuchsia', bg: 'bg-fuchsia-100', text: 'text-fuchsia-700' },
  { key: 'pink', labelKey: 'products.colorPink', bg: 'bg-pink-100', text: 'text-pink-700' },
  { key: 'rose', labelKey: 'products.colorRose', bg: 'bg-rose-100', text: 'text-rose-700' },
] as const;

export function parseProductsTab(value: string | null | undefined): ProductsTabType | null {
  if (value === 'products' || value === 'categories' || value === 'addons') return value;
  return null;
}
