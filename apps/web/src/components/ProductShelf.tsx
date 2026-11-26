'use client';
// The Library's Products view: the member's saved products (lib/products.ts), each a name with 2 to 4 of their own photos, private to them in the active workspace.
// They add, edit and delete products here, and the "create more angles" link opens the multi-angle app on a product's first photo. The shelf picker (ShelfPicker.tsx) offers them to the other pages.
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { api, ApiError, errorText, sendJson, thumbUrl } from '@/lib/api';
import { PRODUCT_TYPES } from '@/lib/product-types';
import { MAX_PRODUCT_NAME, MAX_PRODUCT_PHOTOS, MAX_PRODUCTS, MIN_PRODUCT_PHOTOS, PRODUCT_LIMIT, PRODUCT_NAME_TAKEN, type ProductItem } from '@/lib/products';
import { confirmDialog } from './Confirm';
import { type Img, Slot, uploadError, uploadImages } from './image-tools';
import { LoadError } from './LoadError';
import { Modal } from './Modal';
import { Select } from './Select';
import { type StoreOption, StorePicker } from './StorePicker';
import s from './ProductShelf.module.css';

const NO_PRODUCTS = 'Chưa có sản phẩm nào. Thêm 2–4 ảnh một lần, rồi chọn lại ở Tạo video, Thử đồ, Ứng dụng và Marketing Studio.';
const NO_STORE_PRODUCTS = 'Chưa có sản phẩm nào của cửa hàng này. Chọn "Tất cả cửa hàng" để xem mọi sản phẩm.';

/** The form's words for a refused save: the two codes of POST and PATCH, then the shared reasons (another team's store, too many requests). */
const saveError = (e: unknown) =>
  e instanceof ApiError && e.code === PRODUCT_NAME_TAKEN
    ? 'Đã có sản phẩm tên này.'
    : e instanceof ApiError && e.code === PRODUCT_LIMIT
      ? `Bạn đã có ${MAX_PRODUCTS} sản phẩm. Hãy xoá bớt trước khi thêm.`
      : errorText(e, 'Không lưu được sản phẩm. Hãy thử lại.');

/** The cards of the shelf, or the empty line: `filtered` says the list is one store's, so an empty one points at "Tất cả cửa hàng". */
export function ProductCards({ products, filtered, onEdit, onDelete }: { products: ProductItem[]; filtered: boolean; onEdit: (p: ProductItem) => void; onDelete: (p: ProductItem) => void }) {
  if (products.length === 0) return <p className="muted">{filtered ? NO_STORE_PRODUCTS : NO_PRODUCTS}</p>;
  return (
    <ul className={s.list} aria-label="Sản phẩm của bạn">
      {products.map((p) => {
        const type = p.productType ? PRODUCT_TYPES[p.productType] : null;
        const detail = [p.storeName, type].filter(Boolean).join(' · ');
        return (
          <li key={p.id} className={s.card}>
            {p.photos.length > 0 && (
              <div className={s.photos}>
                {p.photos.slice(0, 4).map((photo) => (
                  <img key={photo.id} src={thumbUrl(photo.id)} alt={`${p.name}: ${photo.filename}`} loading="lazy" />
                ))}
              </div>
            )}
            <h3>{p.name}</h3>
            {detail && <p className="muted">{detail}</p>}
            <div className={s.actions}>
              {p.photos[0] && (
                <Link href={`/apps/multi-angle?image=${p.photos[0].id}`} className="button" aria-label={`Tạo thêm góc cho ${p.name}`}>
                  Tạo thêm góc
                </Link>
              )}
              <button type="button" aria-label={`Sửa ${p.name}`} onClick={() => onEdit(p)}>
                Sửa
              </button>
              <button type="button" className="danger" aria-label={`Xoá ${p.name}`} onClick={() => onDelete(p)}>
                Xoá
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The add and edit form: a name, a store, a type and the photos. Saving closes it through `onSaved`. */
function ProductForm({ product, stores, onClose, onSaved }: { product: ProductItem | null; stores: StoreOption[]; onClose: () => void; onSaved: () => void }) {
  const nameId = useId();
  const [name, setName] = useState(product?.name ?? '');
  const [storeId, setStoreId] = useState(product?.storeId ?? '');
  const [type, setType] = useState(product?.productType ?? '');
  const [images, setImages] = useState<Img[]>(product?.photos ?? []);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  async function add(files: File[]) {
    setBusy(true);
    setProblem('');
    try {
      const got = await uploadImages(files, 'image', storeId, 'product');
      setImages((cur) => [...cur, ...got.filter((g) => !cur.some((c) => c.id === g.id))].slice(0, MAX_PRODUCT_PHOTOS));
    } catch (e) {
      setProblem(uploadError(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setProblem('');
    const body = { name: name.trim(), storeId: storeId || null, productType: type || null, assetIds: images.map((i) => i.id) };
    try {
      await api(product ? `/api/products/${product.id}` : '/api/products', sendJson(product ? 'PATCH' : 'POST', body));
      onSaved();
    } catch (e) {
      setProblem(saveError(e));
      setBusy(false);
    }
  }
  return (
    <div className={s.form}>
      <h2>{product ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}</h2>
      <div className="field">
        <label className="field-label" htmlFor={nameId}>
          Tên sản phẩm
        </label>
        <input id={nameId} value={name} maxLength={MAX_PRODUCT_NAME} onChange={(e) => setName(e.target.value)} />
      </div>
      <StorePicker label="Cửa hàng" heading="Cửa hàng" value={storeId} stores={stores} noneLabel="Không chọn cửa hàng" onChange={setStoreId} />
      <Select label="Loại sản phẩm" icon="model" heading="Loại sản phẩm" value={type} options={[{ value: '', label: 'Chưa chọn' }, ...Object.entries(PRODUCT_TYPES).map(([value, label]) => ({ value, label }))]} onChange={setType} />
      <Slot
        label="Ảnh sản phẩm"
        empty={`Thêm ${MIN_PRODUCT_PHOTOS}–${MAX_PRODUCT_PHOTOS} ảnh sản phẩm`}
        inputLabel="Ảnh sản phẩm"
        images={images}
        max={MAX_PRODUCT_PHOTOS}
        count="always"
        slot="product"
        busy={busy}
        storeId={storeId}
        onAdd={(files) => void add(files)}
        onRemove={(id) => setImages((cur) => cur.filter((i) => i.id !== id))}
        onPick={(img) => setImages((cur) => (cur.length < MAX_PRODUCT_PHOTOS && !cur.some((c) => c.id === img.id) ? [...cur, img] : cur))}
      />
      <p className="help">{MIN_PRODUCT_PHOTOS}–{MAX_PRODUCT_PHOTOS} ảnh: mặt trước, mặt sau, cận cảnh.</p>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <button type="button" className="primary" disabled={busy || !name.trim() || images.length < MIN_PRODUCT_PHOTOS} onClick={() => void save()}>
        Lưu
      </button>
      <button type="button" onClick={onClose}>
        Huỷ
      </button>
    </div>
  );
}

export function ProductShelf() {
  const [products, setProducts] = useState<ProductItem[] | 'failed' | null>(null);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [store, setStore] = useState('');
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<ProductItem | 'new' | null>(null);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    api<{ stores: StoreOption[] }>('/api/stores').then((r) => setStores(r.stores), () => undefined); // without the list the filter offers every store only
  }, []);
  useEffect(() => {
    let live = true; // a later filter's answer wins over a slower earlier one
    api<{ products: ProductItem[] }>(`/api/products${store ? `?storeId=${encodeURIComponent(store)}` : ''}`).then(
      (r) => live && setProducts(r.products),
      () => live && setProducts('failed'),
    );
    return () => void (live = false);
  }, [store, version]);
  const reload = () => (setProducts(null), setVersion((v) => v + 1));
  async function remove(p: ProductItem) {
    if (!(await confirmDialog({ title: 'Xoá sản phẩm này?', body: 'Ảnh của sản phẩm không bị xoá.', confirmLabel: 'Xoá', danger: true }))) return;
    setProblem('');
    try {
      await api(`/api/products/${p.id}`, { method: 'DELETE' });
      reload();
    } catch (e) {
      setProblem(errorText(e, 'Không xoá được sản phẩm. Hãy thử lại.'));
    }
  }
  return (
    <div className="product-shelf">
      <div className={s.top}>
        <p className="muted">Sản phẩm của bạn, dùng lại ở mọi trang. Chỉ bạn thấy.</p>
        <button type="button" className="primary" onClick={() => setEditing('new')}>
          Thêm sản phẩm
        </button>
      </div>
      <div className={s.filter} role="group" aria-label="Lọc sản phẩm">
        <StorePicker label="Cửa hàng" heading="Lọc theo cửa hàng" value={store} stores={stores} noneLabel="Tất cả cửa hàng" onChange={setStore} />
      </div>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {products === null && (
        <p className="muted" role="status">
          Đang tải sản phẩm...
        </p>
      )}
      {products === 'failed' && <LoadError text="Không tải được sản phẩm." onRetry={reload} />}
      {Array.isArray(products) && <ProductCards products={products} filtered={store !== ''} onEdit={setEditing} onDelete={(p) => void remove(p)} />}
      <Modal open={editing !== null} onClose={() => setEditing(null)} label={editing === 'new' ? 'Thêm sản phẩm' : 'Sửa sản phẩm'} className="choice-dialog">
        {editing !== null && (
          <ProductForm
            key={editing === 'new' ? 'new' : editing.id}
            product={editing === 'new' ? null : editing}
            stores={stores}
            onClose={() => setEditing(null)}
            onSaved={() => (setEditing(null), reload())}
          />
        )}
      </Modal>
    </div>
  );
}
