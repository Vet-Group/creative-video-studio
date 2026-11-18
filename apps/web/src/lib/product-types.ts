// The products the company sells (print on demand), which an Admin tags a curated example with so each Examples tab filters by them.
// Migration 0097 checks examples.product_type against these keys; product-types.test.ts keeps the two in step.

/** Each product type by its key, with the label the filter shows, in the order the filter lists them. */
export const PRODUCT_TYPES: Record<string, string> = {
  tshirt: 'Áo thun',
  jersey: 'Jersey',
  hoodie: 'Hoodie, sweatshirt',
  mask_hoodie: 'Hoodie mặt nạ khoá kéo',
  hawaiian: 'Áo Hawaii',
  polo: 'Polo',
  mug: 'Cốc',
  tumbler: 'Tumbler, bình giữ nhiệt',
  ornament: 'Ornament',
  flag: 'Cờ',
  decal: 'Decal, sticker',
  poster: 'Poster, tranh canvas',
  blanket: 'Chăn',
  cap: 'Mũ',
  jewelry: 'Trang sức',
  shoes: 'Giày, Crocs',
  garage: 'Gara cover',
  door: 'Door cover',
  curtain: 'Door curtain',
  home: 'Đồ trang trí nhà',
  other: 'Khác',
};

export const isProductType = (value: unknown): value is string => typeof value === 'string' && Object.hasOwn(PRODUCT_TYPES, value);
