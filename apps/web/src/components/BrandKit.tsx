'use client';
// A store's brand kit (lib/brand.ts): the store picker of Marketing Studio and Image Generation with the switch that has POST /api/jobs add the
// chosen store's kit to the prompt (`useBrand`), and the form a template editor edits a kit in, here or on the Admin stores page.
import { useEffect, useId, useState } from 'react';
import { api, sendJson } from '@/lib/api';
import { type BrandKit, hasBrand, MAX_BRAND_COLORS, MAX_BRAND_TAGLINE, MAX_BRAND_VOICE } from '@/lib/brand';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { Select } from './Select';

export type BrandStore = BrandKit & { id: string; name: string };

const HEX = /^#[0-9a-f]{6}$/i;

/** Edits `store`'s kit (closed while it is null); `onSaved` gets the store with the kit as saved. */
export function BrandKitForm({ store, onClose, onSaved }: { store: BrandStore | null; onClose: () => void; onSaved: (store: BrandStore) => void }) {
  const id = useId();
  const [voice, setVoice] = useState('');
  const [colors, setColors] = useState('');
  const [tagline, setTagline] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!store) return;
    setVoice(store.brandVoice ?? '');
    setColors(store.brandColors.join(', '));
    setTagline(store.brandTagline ?? '');
    setError('');
  }, [store]);
  const list = colors.split(/[\s,]+/).filter(Boolean);
  const colorsOk = list.length <= MAX_BRAND_COLORS && list.every((c) => HEX.test(c));

  async function save() {
    setBusy(true);
    setError('');
    try {
      const saved = await api<BrandKit>(`/api/stores/${encodeURIComponent(store!.id)}`, sendJson('PATCH', { brandVoice: voice, brandColors: list, brandTagline: tagline }));
      onSaved({ ...store!, brandVoice: saved.brandVoice, brandColors: saved.brandColors, brandTagline: saved.brandTagline });
    } catch {
      setError('Không lưu được bộ nhận diện, hãy thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={store !== null} onClose={onClose} label="Bộ nhận diện" className="choice-dialog">
      <h2>Bộ nhận diện{store && `: ${store.name}`}</h2>
      <p className="help">Khi bật &quot;Dùng bộ nhận diện&quot; ở Marketing Studio hoặc Tạo ảnh, phong cách và màu của cửa hàng được thêm vào prompt gửi đi. Khẩu hiệu chỉ dùng khi prompt yêu cầu chữ trên ảnh.</p>
      <label className="field-label" htmlFor={`${id}-voice`}>
        Phong cách thương hiệu
      </label>
      <textarea id={`${id}-voice`} rows={3} maxLength={MAX_BRAND_VOICE} placeholder="Ví dụ: tối giản, sang trọng, tông ấm, ánh sáng tự nhiên" value={voice} onChange={(e) => setVoice(e.target.value)} />
      <label className="field-label" htmlFor={`${id}-colors`}>
        Màu thương hiệu (mã hex, cách nhau bằng dấu phẩy)
      </label>
      <input id={`${id}-colors`} placeholder="#C8102E, #FFFFFF" aria-describedby={`${id}-colors-help`} value={colors} onChange={(e) => setColors(e.target.value)} />
      <p className={colorsOk ? 'help brand-colors' : 'error brand-colors'} id={`${id}-colors-help`}>
        {list.filter((c) => HEX.test(c)).map((c) => (
          <span key={c} className="brand-swatch" style={{ background: c }} aria-hidden="true" />
        ))}
        {colorsOk ? `Tối đa ${MAX_BRAND_COLORS} màu.` : `Tối đa ${MAX_BRAND_COLORS} màu, mỗi màu dạng #RRGGBB.`}
      </p>
      <label className="field-label" htmlFor={`${id}-tagline`}>
        Khẩu hiệu hoặc lời kêu gọi
      </label>
      <input id={`${id}-tagline`} maxLength={MAX_BRAND_TAGLINE} value={tagline} onChange={(e) => setTagline(e.target.value)} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="primary" disabled={busy || !colorsOk} onClick={() => void save()}>
        Lưu
      </button>
    </Modal>
  );
}

/**
 * The store picker with the "Dùng bộ nhận diện" switch, which works once the chosen store has a kit (the server adds nothing otherwise), and for a
 * template editor a "Bộ nhận diện" button that edits the chosen store's kit.
 */
/** `onKit` hears the kit Run adds (null when none), for the page's prompt preview (PromptPreview). */
export function BrandPicker({ storeId, onStore, on, onToggle, onKit }: { storeId: string; onStore: (id: string) => void; on: boolean; onToggle: (on: boolean) => void; onKit?: (kit: BrandKit | null) => void }) {
  const [stores, setStores] = useState<BrandStore[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<BrandStore | null>(null);
  useEffect(() => {
    api<{ stores: BrandStore[]; canEdit: boolean }>('/api/stores').then(
      (r) => (setStores(r.stores), setCanEdit(r.canEdit)),
      () => setFailed(true),
    );
  }, []);
  const store = stores.find((s) => s.id === storeId);
  const usable = store !== undefined && hasBrand(store);
  useEffect(() => onKit?.(on && usable ? store : null), [on, usable, store]);
  return (
    <div className="brand-picker">
      <Select label="Cửa hàng/Thương hiệu" icon="store" heading="Chọn cửa hàng hoặc thương hiệu" value={storeId} options={[{ value: '', label: 'Không chọn' }, ...stores.map((s) => ({ value: s.id, label: s.name }))]} onChange={onStore} />
      <button
        type="button"
        className="enhance"
        aria-pressed={on && usable}
        disabled={!usable}
        title={usable ? 'Thêm phong cách và màu của cửa hàng vào prompt gửi đi' : store ? 'Cửa hàng này chưa có bộ nhận diện' : 'Chọn cửa hàng để dùng bộ nhận diện'}
        onClick={() => onToggle(!on)}
      >
        <Icon name="store" size={12} />
        Dùng bộ nhận diện
      </button>
      {canEdit && store && (
        <button type="button" className="link-button" onClick={() => setEditing(store)}>
          Bộ nhận diện
        </button>
      )}
      {failed && <p className="error">Không tải được danh sách cửa hàng.</p>}
      <BrandKitForm store={editing} onClose={() => setEditing(null)} onSaved={(s) => (setStores((cur) => cur.map((x) => (x.id === s.id ? s : x))), setEditing(null))} />
    </div>
  );
}
