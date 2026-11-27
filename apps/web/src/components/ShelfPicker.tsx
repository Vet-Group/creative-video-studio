'use client';
// The shelf picker, a link ("from the product shelf") beside the uploaded-photos link that opens the member's saved products (GET /api/products) as one group of photos each. A pick hands the
// photo to `onPick` as an upload would (the same asset id, nothing sent again). Photos already in the form (`taken`) are left out, as a job takes each input once; the list is
// read on every open. It opens on the page's store (`storeId`), as the uploaded-photos picker does, and a store filter narrows it.
import { useEffect, useState } from 'react';
import { api, thumbUrl } from '@/lib/api';
import type { ProductItem } from '@/lib/products';
import type { UploadSlot } from '@/lib/upload-slots';
import { Icon } from './Icon';
import { type Img, PhotoDialog } from './image-tools';
import { Modal } from './Modal';
import { ProductShelf } from './ProductShelf';
import { type StoreOption, StorePicker } from './StorePicker';

type Group = NonNullable<Parameters<typeof PhotoDialog>[0]['groups']>[number];

/** Whether a slot offers the shelf: every slot but a person's (model) and a background, which no product photo goes in. An unlabelled slot (undefined) does. */
export const offersShelf = (slot?: UploadSlot): boolean => slot !== 'model' && slot !== 'background';

/** One group of photo tiles per product, in the order given (newest first) and titled by the product's name alone (it is unique per member and workspace); photos in `taken` are left out, and a group left empty is skipped. */
export function shelfGroups(products: ProductItem[], taken: Img[], onPick: (img: Img) => void): Group[] {
  return products
    .map((p) => ({
      title: p.name,
      tiles: p.photos.filter((photo) => !taken.some((t) => t.id === photo.id)).map((photo) => ({ key: photo.id, src: thumbUrl(photo.id), label: `Dùng ${photo.filename} của ${p.name}`, pick: () => onPick({ id: photo.id, filename: photo.filename }) })),
    }))
    .filter((g) => g.tiles.length > 0);
}

export function ShelfPicker({ name, taken, disabled, onPick, storeId = '', className = 'link-button uploads-link' }: { name: string; taken: Img[]; disabled?: boolean; onPick: (img: Img) => void; storeId?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false); // the shelf itself, opened from an empty picker
  const [store, setStore] = useState('');
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [list, setList] = useState<ProductItem[] | 'failed' | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true; // a later filter's answer wins over a slower earlier one
    setList(null);
    api<{ products: ProductItem[] }>(`/api/products${store ? `?storeId=${encodeURIComponent(store)}` : ''}`).then(
      (r) => live && setList(r.products),
      () => live && setList('failed'),
    );
    return () => void (live = false);
  }, [open, store]);
  function show() {
    setOpen(true);
    setStore(storeId);
    if (stores.length === 0) api<{ stores: StoreOption[] }>('/api/stores').then((r) => setStores(r.stores), () => undefined); // without the list the filter offers every store only
  }
  const groups = Array.isArray(list) ? shelfGroups(list, taken, onPick) : [];
  const empty = Array.isArray(list) && list.length === 0;
  const sub =
    list === null
      ? 'Đang tải sản phẩm...'
      : list === 'failed'
        ? 'Không tải được kệ sản phẩm. Hãy đóng và mở lại.'
        : groups.length > 0
          ? 'Sản phẩm bạn đã lưu, mới nhất trước. Chọn một ảnh.'
          : !empty
            ? 'Không còn ảnh sản phẩm nào khác để chọn.'
            : store
              ? 'Chưa có sản phẩm nào của cửa hàng này. Chọn "Tất cả cửa hàng" để xem mọi sản phẩm.'
              : 'Chưa có sản phẩm nào.';
  return (
    <>
      {/* Icon and words; a narrow head hides the words (the name stays as the button's name and tooltip). */}
      <button type="button" className={className} aria-label={name} title={name} aria-haspopup="dialog" disabled={disabled} onClick={show}>
        <Icon name="model" size={14} />
        <span className="shelf-text">Từ kệ sản phẩm</span>
      </button>
      <PhotoDialog
        open={open}
        title="Kệ sản phẩm"
        sub={sub}
        tiles={[]}
        groups={groups}
        busy={false}
        onClose={() => setOpen(false)}
        // The shelf opens over the form, which stays as filled in; a new tab had no way back in the installed app (iPad, iPhone).
        create={empty && !store ? { label: 'Thêm sản phẩm', onClick: () => (setOpen(false), setAdding(true)) } : undefined}
        filter={
          <div className="uploads-filter">
            <StorePicker label="Lọc theo cửa hàng" heading="Lọc theo cửa hàng" value={store} stores={stores} noneLabel="Tất cả cửa hàng" onChange={setStore} />
          </div>
        }
      />
      {/* Closing it opens the picker again, which reads the shelf anew. */}
      <Modal open={adding} onClose={() => (setAdding(false), show())} label="Sản phẩm đã lưu" className="shelf-add">
        {adding && <ProductShelf />}
      </Modal>
    </>
  );
}
