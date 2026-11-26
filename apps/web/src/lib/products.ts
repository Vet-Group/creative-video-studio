// The product shelf (the Library's Products view, components/ProductShelf.tsx, and the shelf picker, components/ShelfPicker.tsx): a member's saved products, each a
// name with two to four of their own photos. This half is safe to import in the browser; the checks and SQL are in app/api/products/fields.ts.

/** A product as GET /api/products lists it; `photos` are the live ones, in the saved order. */
export type ProductItem = {
  id: string;
  name: string;
  storeId: string | null;
  storeName: string | null;
  /** A key of lib/product-types.ts, or null. */
  productType: string | null;
  photos: { id: string; filename: string }[];
  createdAt: string;
};

export const MAX_PRODUCT_NAME = 60;
/** The database takes one to four photos; the API asks for two or more. */
export const MIN_PRODUCT_PHOTOS = 2;
export const MAX_PRODUCT_PHOTOS = 4;
/** The most products one member keeps, across workspaces. */
export const MAX_PRODUCTS = 100;

/** The `code` of the 409 for a name the member already uses (the check is case-insensitive), and of the 409 at MAX_PRODUCTS; the form words both. */
export const PRODUCT_NAME_TAKEN = 'product_name_taken';
export const PRODUCT_LIMIT = 'product_limit';
