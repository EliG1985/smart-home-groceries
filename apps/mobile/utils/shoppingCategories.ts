export type ShoppingCategoryQuantityMode = 'count' | 'weight';
export type ShoppingCategoryExpiryPolicy = 'hidden' | 'optional' | 'required';

export type ShoppingCategoryDefinition = {
  id: string;
  labelKey: string;
  defaultLabel: string;
  quantityMode: ShoppingCategoryQuantityMode;
  expiryPolicy: ShoppingCategoryExpiryPolicy;
  aliases?: string[];
};

export const SHOPPING_CATEGORIES: ShoppingCategoryDefinition[] = [
  {
    id: 'fruits-vegetables',
    labelKey: 'shoppingList.categories.fruitsVegetables',
    defaultLabel: 'Fruits & Vegetables',
    quantityMode: 'weight',
    expiryPolicy: 'hidden',
    aliases: ['fruit', 'fruits', 'vegetable', 'vegetables', 'produce'],
  },
  {
    id: 'meat-poultry',
    labelKey: 'shoppingList.categories.meatPoultry',
    defaultLabel: 'Meat & Poultry',
    quantityMode: 'weight',
    expiryPolicy: 'required',
    aliases: ['meat', 'poultry', 'chicken', 'beef'],
  },
  {
    id: 'fish-seafood',
    labelKey: 'shoppingList.categories.fishSeafood',
    defaultLabel: 'Fish & Seafood',
    quantityMode: 'weight',
    expiryPolicy: 'required',
    aliases: ['fish', 'seafood'],
  },
  {
    id: 'dairy-eggs',
    labelKey: 'shoppingList.categories.dairyEggs',
    defaultLabel: 'Dairy & Eggs',
    quantityMode: 'count',
    expiryPolicy: 'required',
    aliases: ['dairy', 'milk', 'eggs', 'cheese', 'yogurt'],
  },
  {
    id: 'bakery-bread',
    labelKey: 'shoppingList.categories.bakeryBread',
    defaultLabel: 'Bakery & Bread',
    quantityMode: 'count',
    expiryPolicy: 'required',
    aliases: ['bakery', 'bread', 'pastry'],
  },
  {
    id: 'deli-prepared',
    labelKey: 'shoppingList.categories.deliPrepared',
    defaultLabel: 'Deli & Prepared Foods',
    quantityMode: 'weight',
    expiryPolicy: 'required',
    aliases: ['deli', 'prepared', 'ready meal', 'ready-made'],
  },
  {
    id: 'frozen-foods',
    labelKey: 'shoppingList.categories.frozenFoods',
    defaultLabel: 'Frozen Foods',
    quantityMode: 'count',
    expiryPolicy: 'required',
    aliases: ['frozen', 'ice cream'],
  },
  {
    id: 'pantry-dry-goods',
    labelKey: 'shoppingList.categories.pantryDryGoods',
    defaultLabel: 'Pantry & Dry Goods',
    quantityMode: 'count',
    expiryPolicy: 'optional',
    aliases: ['pantry', 'dry goods', 'rice', 'pasta', 'grains'],
  },
  {
    id: 'canned-jarred',
    labelKey: 'shoppingList.categories.cannedJarred',
    defaultLabel: 'Canned & Jarred',
    quantityMode: 'count',
    expiryPolicy: 'optional',
    aliases: ['canned', 'jarred', 'cans'],
  },
  {
    id: 'breakfast-cereal',
    labelKey: 'shoppingList.categories.breakfastCereal',
    defaultLabel: 'Breakfast & Cereal',
    quantityMode: 'count',
    expiryPolicy: 'optional',
    aliases: ['breakfast', 'cereal', 'granola'],
  },
  {
    id: 'beverages',
    labelKey: 'shoppingList.categories.beverages',
    defaultLabel: 'Beverages',
    quantityMode: 'count',
    expiryPolicy: 'optional',
    aliases: ['beverage', 'beverages', 'drinks', 'juice', 'water', 'soda'],
  },
  {
    id: 'snacks-candy',
    labelKey: 'shoppingList.categories.snacksCandy',
    defaultLabel: 'Snacks & Candy',
    quantityMode: 'count',
    expiryPolicy: 'optional',
    aliases: ['snacks', 'candy', 'chips', 'cookies'],
  },
  {
    id: 'household-cleaning',
    labelKey: 'shoppingList.categories.householdCleaning',
    defaultLabel: 'Household & Cleaning',
    quantityMode: 'count',
    expiryPolicy: 'hidden',
    aliases: ['household', 'cleaning', 'detergent'],
  },
  {
    id: 'personal-care',
    labelKey: 'shoppingList.categories.personalCare',
    defaultLabel: 'Personal Care',
    quantityMode: 'count',
    expiryPolicy: 'hidden',
    aliases: ['personal care', 'toiletries', 'soap', 'shampoo'],
  },
  {
    id: 'other',
    labelKey: 'shoppingList.categories.other',
    defaultLabel: 'Other',
    quantityMode: 'count',
    expiryPolicy: 'optional',
    aliases: ['other'],
  },
];

const normalizeCategoryToken = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const getShoppingCategoryDefinition = (
  value: string,
): ShoppingCategoryDefinition | null => {
  const normalized = normalizeCategoryToken(value);
  if (!normalized) {
    return null;
  }

  return (
    SHOPPING_CATEGORIES.find((category) => {
      const candidates = [category.id, category.defaultLabel, ...(category.aliases ?? [])];
      return candidates.some((candidate) => normalizeCategoryToken(candidate) === normalized);
    }) ?? null
  );
};

export const applyCategoryRulesToForm = <T extends { category: string; expiryDate: string }>(
  form: T,
  categoryId: string,
): T => {
  const definition = getShoppingCategoryDefinition(categoryId);
  if (!definition) {
    return { ...form, category: categoryId };
  }

  return {
    ...form,
    category: definition.defaultLabel,
    expiryDate: definition.expiryPolicy === 'hidden' ? '' : form.expiryDate,
  };
};