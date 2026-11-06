'use client';
// The choices library's pickers (GET /api/choices): a box on the form that opens a dialog of hook, location or ending cards, grouped by who shares them and
// filtered by store and niche, with a form that adds one (private, for the chosen store or, for a template editor, for the company) with an optional photo.
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import { cardSample } from '@/lib/examples';
import { BUILT_IN_CHOICES, MAX_CHOICE_DESC, MAX_CHOICE_NAME, MAX_CHOICE_NICHE, MAX_CHOICE_PHRASE, type MarketingChoice, type ParamFormat } from '@/lib/marketing';
import { useSamples } from '@/lib/use-samples';
import { CardMedia } from './CardMedia';
import { confirmDialog } from './Confirm';
import { Icon, type IconName } from './Icon';
import { type Img, Slot, uploadError, uploadImages } from './image-tools';
import { useJobs } from './jobs';
import { Modal } from './Modal';
import { Select } from './Select';
import { SuggestButton } from './Suggestions';

export type ChoiceKind = keyof typeof BUILT_IN_CHOICES;

/** A box on the form that opens the list of choices; shows the chosen one. */
/** With `media` (the chosen choice's sample), a chosen box shows it full size under a name chip, as on Fash: its still, the loop only when there is no still. */
export function ChoiceBox({ label, icon, value, media, onOpen, onClear }: { label: string; icon: IconName; value: string | undefined; media?: { video: string | null; poster: string | null }; onOpen: () => void; onClear: () => void }) {
  const filled = value !== undefined && media !== undefined && (media.video ?? media.poster) !== null;
  const name = label.replace(' (tuỳ chọn)', '');
  const labelId = useId();
  const valueId = useId();
  return (
    <div className="field">
      <button type="button" className="choice-box" data-filled={filled || undefined} aria-haspopup="dialog" aria-labelledby={`${labelId} ${valueId}`} onClick={onOpen}>
        {filled && <CardMedia video={media.poster ? null : media.video} poster={media.poster} />}
        <span className="slot-icon" aria-hidden="true">
          <Icon name={icon} size={16} />
        </span>
        {/* One line: the name, with the optional note for screen readers only; the eye gets the Optional chip under it. */}
        <span id={labelId} className="choice-label">
          {name}
          {name !== label && <span className="sr-only"> (tuỳ chọn)</span>}
        </span>
        {name !== label && !filled && (
          <span className="choice-optional" aria-hidden="true">
            Tuỳ chọn
          </span>
        )}
        <span id={valueId} className={value ? 'choice-value' : 'choice-value sr-only'}>
          {value ?? 'Chưa chọn'}
        </span>
      </button>
      {value !== undefined && (
        <button type="button" className="choice-clear" aria-label={`Bỏ ${name}`} onClick={onClear}>
          <Icon name="x" size={12} />
        </button>
      )}
    </div>
  );
}

/** One choice as GET /api/choices lists it: who shares it (`group`), its store and niche tag, and its photo. */
export interface Choice extends MarketingChoice {
  group: 'store' | 'company' | 'mine' | 'builtin';
  isCompany: boolean;
  mine: boolean;
  storeId: string | null;
  storeName: string | null;
  niche: string | null;
  imageAssetId: string | null;
}
/** GET /api/choices: each kind's list (the built-in ones last), and the often-used ids (those the member used twice or more in 90 days). */
export interface ChoiceLists {
  hooks: Choice[];
  locations: Choice[];
  endings: Choice[];
  often: Record<ChoiceKind, string[]>;
  /** Per often-used id, the poster of the member's latest clip with it. */
  posters: Record<ChoiceKind, Record<string, string>>;
  /** A template editor (an Admin too): shares with the company, deletes shared entries. */
  canShare: boolean;
}
/** The built-in choices of `kind` in the list's shape, shown until the lists load. */
export const builtInChoices = (kind: ChoiceKind): Choice[] =>
  BUILT_IN_CHOICES[kind].map((c) => ({ ...c, group: 'builtin', isCompany: false, mine: false, storeId: null, storeName: null, niche: null, imageAssetId: null }));

/** The page's lists (null until they load; the built-in ones show meanwhile), `reload` after a change, and `remove`, which asks first. */
export function useChoiceLists(format?: ParamFormat) {
  const { notify } = useJobs();
  const [lists, setLists] = useState<ChoiceLists | null>(null);
  const reload = () => api<ChoiceLists>(`/api/choices${format ? `?format=${format}` : ''}`).then(setLists, () => {}); // a failure leaves the built-in ones
  useEffect(() => void reload(), [format]);
  async function remove(c: Choice) {
    if (!(await confirmDialog({ title: `Xoá "${c.name}"?`, confirmLabel: 'Xoá', danger: true }))) return;
    try {
      await api(`/api/choices/${encodeURIComponent(c.id)}`, { method: 'DELETE' });
      await reload();
    } catch (e) {
      notify(errorText(e, 'Không xoá được.'));
    }
  }
  return { lists, setLists, reload, remove };
}

/** Each kind's list in GET /api/choices. */
export const LIST_OF = { hook: 'hooks', location: 'locations', ending: 'endings' } as const;

/**
 * A prompt section's library box (PromptSections.tsx): a pick, or a new hook or ending saved in the dialog, fills the section's words with its phrase,
 * which stay the member's to edit; the box names the choice while the words are its phrase, and its X empties them.
 */
export function PhraseChoice({ kind, label, title, sub, choices, stores, storeId, text, onText }: { kind: 'hook' | 'ending'; label: string; title: string; sub: string; choices: ReturnType<typeof useChoiceLists>; stores: Store[]; storeId: string; text: string; onText: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const list = choices.lists?.[LIST_OF[kind]] ?? builtInChoices(kind);
  const picked = list.filter((c) => c.phrase === text.trim());
  const take = (phrase: string) => (onText(phrase), setOpen(false));
  function added(c: Choice) {
    choices.setLists((cur) => cur && { ...cur, [LIST_OF[kind]]: [c, ...cur[LIST_OF[kind]]] });
    if (!choices.lists) void choices.reload(); // the lists failed to load at first: fetch them, so the new one is listed
    take(c.phrase);
  }
  return (
    <>
      <ChoiceBox label={label} icon={kind === 'hook' ? 'film' : 'check'} value={picked[0]?.name} onOpen={() => setOpen(true)} onClear={() => onText('')} />
      <ChoiceDialog open={open} title={title} sub={sub} kind={kind} choices={list} often={choices.lists?.often[kind] ?? []} posters={choices.lists?.posters[kind] ?? {}} canShare={choices.lists?.canShare ?? false} stores={stores} storeId={storeId}
        selected={picked.map((c) => c.id)} onPick={(id) => take(list.find((c) => c.id === id)?.phrase ?? '')} onAdded={added} onEdited={() => void choices.reload()} onDelete={(c) => void choices.remove(c)} onClose={() => setOpen(false)} />
    </>
  );
}

const KIND_NAME = { hook: 'hook', location: 'bối cảnh', ending: 'cảnh kết' } as const;

/** What each kind is, and three filled examples a member can start from: the name and card line in Vietnamese, the scene for the model in English. */
const CHOICE_HELP = {
  hook: {
    intro: 'Hook là 1-2 giây mở đầu clip để giữ người xem lại. Đặt tên, tả ngắn bằng tiếng Việt, rồi viết điều xảy ra ở đầu clip bằng tiếng Anh.',
    name: 'Ví dụ: Mở hộp quà',
    desc: 'Ví dụ: Hộp quà bật mở, sản phẩm hiện ra',
    phrase: 'Ví dụ: The clip opens on a gift box that bursts open to reveal the product.',
    phraseHelp: 'Một câu tả điều xảy ra ở đầu clip. AI tạo video hiểu tiếng Anh tốt nhất.',
    examples: [
      { name: 'Mở hộp quà', desc: 'Hộp quà bật mở, sản phẩm hiện ra', phrase: 'The clip opens on a gift box that bursts open to reveal the product, and the creator reacts with delight.' },
      { name: 'Trước và sau', desc: 'Từ bộ đồ cũ sang bộ đồ mới trong một cú chuyển cảnh', phrase: 'The clip opens with the creator in a plain old outfit, then a quick snap transition reveals them in the new outfit.' },
      { name: 'Xoay một vòng', desc: 'Xoay một vòng khoe trọn bộ đồ', phrase: 'The clip opens with the creator spinning once to show the whole outfit, then stopping to face the camera.' },
    ],
  },
  location: {
    intro: 'Bối cảnh là nơi diễn ra clip. Đặt tên, tả ngắn bằng tiếng Việt, rồi viết nơi đó bằng tiếng Anh.',
    name: 'Ví dụ: Quán cà phê',
    desc: 'Ví dụ: Góc quán cà phê ấm cúng',
    phrase: 'Ví dụ: a cozy corner cafe with warm light',
    phraseHelp: 'Một cụm tả nơi chốn, không cần cả câu: prompt sẽ thành "Set in <cụm này>." AI tạo video hiểu tiếng Anh tốt nhất.',
    examples: [
      { name: 'Quán cà phê', desc: 'Góc quán cà phê ấm cúng', phrase: 'a cozy corner cafe with warm light' },
      { name: 'Bãi biển', desc: 'Bãi biển nắng vàng buổi chiều', phrase: 'a sunny beach in golden afternoon light' },
      { name: 'Cửa hàng thời trang', desc: 'Cửa hàng quần áo sáng sủa', phrase: 'a bright clothing boutique with racks of clothes behind' },
    ],
  },
  ending: {
    intro: 'Cảnh kết là vài giây cuối clip. Đặt tên, tả ngắn bằng tiếng Việt, rồi viết điều xảy ra ở cuối clip bằng tiếng Anh.',
    name: 'Ví dụ: Giơ sản phẩm, mỉm cười',
    desc: 'Ví dụ: Người mẫu giơ sản phẩm về phía máy quay',
    phrase: 'Ví dụ: The clip ends with the model holding the product up to the camera and smiling.',
    phraseHelp: 'Một câu tả điều xảy ra ở cuối clip. AI tạo video hiểu tiếng Anh tốt nhất.',
    examples: [
      { name: 'Giơ sản phẩm', desc: 'Giơ sản phẩm về phía máy quay và mỉm cười', phrase: 'The clip ends with the model holding the product up to the camera and smiling.' },
      { name: 'Cận cảnh', desc: 'Dừng ở cận cảnh sản phẩm', phrase: 'The clip ends on a still close-up of the product.' },
      { name: 'Vẫy tay chào', desc: 'Vẫy tay chào người xem', phrase: 'The clip ends with the model waving goodbye to the camera.' },
    ],
  },
} as const;

/** "12/40" beside a field once it is near its limit. */
function CharCount({ value, max }: { value: string; max: number }) {
  return value.length >= max * 0.7 ? <span className="char-count">{value.length}/{max}</span> : null;
}

type Store = { id: string; name: string };
type Share = 'mine' | 'store' | 'company';

/**
 * Add a choice: a name, an optional card line, niche tag and photo, and the English scene the prompt takes, saved and chosen at once. It stays the
 * member's own, or goes to `store` (the store the dialog shows; none for every store) or, for a template editor (`canShare`), to the company. An example
 * fills the words. With `edit`, the same form starts from that choice and saves its changes (PATCH /api/choices/:id).
 */
function AddChoice({ kind, canShare, store, niche: initialNiche, edit, onAdded, onCancel }: { kind: ChoiceKind; canShare: boolean; store: Store | undefined; niche: string; edit?: Choice; onAdded: (c: Choice) => void; onCancel: () => void }) {
  const [name, setName] = useState(edit?.name ?? '');
  const [phrase, setPhrase] = useState(edit?.phrase ?? '');
  const [desc, setDesc] = useState(edit?.desc ?? '');
  const [niche, setNiche] = useState(edit ? (edit.niche ?? '') : initialNiche);
  const [photo, setPhoto] = useState<Img[]>(edit?.imageAssetId ? [{ id: edit.imageAssetId, filename: edit.name }] : []);
  const [share, setShare] = useState<Share>(edit?.isCompany ? 'company' : edit?.storeId ? 'store' : 'mine');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ids = { name: useId(), phrase: useId(), desc: useId(), niche: useId(), help: useId() };
  const help = CHOICE_HELP[kind];
  // The box wraps a long sentence; the prompt takes it on one line.
  const scene = phrase.replace(/\s+/g, ' ').trim();
  async function upload(files: File[]) {
    setBusy(true);
    setError('');
    try {
      setPhoto(await uploadImages(files.slice(0, 1), 'image', store?.id, 'illustration'));
    } catch (e) {
      setError(uploadError(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      const shared = share === 'company' ? { isCompany: true } : share === 'store' && store ? { storeId: store.id } : {};
      const c = edit
        ? // Every field, so a cleared one is cleared and the share level is the form's.
          await api<Choice>(`/api/choices/${encodeURIComponent(edit.id)}`, sendJson('PATCH', { name: name.trim(), phrase: scene, desc: desc.trim(), niche: niche.trim() || null, imageAssetId: photo[0]?.id ?? null, isCompany: false, storeId: null, ...shared }))
        : await api<Choice>('/api/choices', sendJson('POST', { kind, name: name.trim(), phrase: scene, ...(desc.trim() && { desc: desc.trim() }), ...(niche.trim() && { niche: niche.trim() }), ...(photo[0] && { imageAssetId: photo[0].id }), ...shared }));
      onAdded(c);
    } catch (e) {
      setError(errorText(e, `Không lưu được ${KIND_NAME[kind]}, hãy thử lại.`));
    } finally {
      setBusy(false);
    }
  }
  const shares = [
    { value: 'mine', label: 'Chỉ mình tôi' },
    { value: 'store', label: store ? `Cửa hàng đang chọn (${store.name})` : 'Cửa hàng đang chọn', disabled: !store },
    ...(canShare || edit?.isCompany ? [{ value: 'company', label: 'Toàn công ty' }] : []),
  ];
  return (
    <div className="choice-form" role="group" aria-label={`${edit ? 'Sửa' : 'Thêm'} ${KIND_NAME[kind]}`}>
      <p className="help">{help.intro}</p>
      {!edit && (
        <div className="choice-examples" role="group" aria-label="Điền thử một ví dụ">
          <span aria-hidden="true">Điền thử:</span>
          {help.examples.map((e) => (
            <button key={e.name} type="button" onClick={() => (setName(e.name), setDesc(e.desc), setPhrase(e.phrase))}>
              {e.name}
            </button>
          ))}
        </div>
      )}
      <div className="field-head">
        <label className="field-label" htmlFor={ids.name}>
          Tên
        </label>
        <CharCount value={name} max={MAX_CHOICE_NAME} />
      </div>
      <input id={ids.name} value={name} maxLength={MAX_CHOICE_NAME} placeholder={help.name} autoFocus onChange={(e) => setName(e.target.value)} />
      <div className="field-head">
        <label className="field-label" htmlFor={ids.desc}>
          Mô tả ngắn (tuỳ chọn)
        </label>
        <CharCount value={desc} max={MAX_CHOICE_DESC} />
      </div>
      <input id={ids.desc} value={desc} maxLength={MAX_CHOICE_DESC} placeholder={help.desc} onChange={(e) => setDesc(e.target.value)} />
      <div className="field-head">
        <label className="field-label" htmlFor={ids.phrase}>
          Cảnh cho AI (tiếng Anh)
        </label>
        <CharCount value={phrase} max={MAX_CHOICE_PHRASE} />
        {/* Written from the Vietnamese name and description, so it waits for a name. */}
        <SuggestButton label="AI viết giúp" disabled={!name.trim()} ask={() => ({ field: kind, text: [name.trim(), desc.trim()].filter(Boolean).join(' - ') })} onPick={setPhrase} />
      </div>
      <textarea id={ids.phrase} lang="en" rows={3} value={phrase} maxLength={MAX_CHOICE_PHRASE} placeholder={help.phrase} aria-describedby={ids.help} onChange={(e) => setPhrase(e.target.value)} />
      <p id={ids.help} className="help">
        {/[À-ỹ]/.test(phrase) ? 'Có vẻ đây là tiếng Việt. Nên viết bằng tiếng Anh để AI hiểu đúng cảnh.' : help.phraseHelp}
      </p>
      {scene && (
        <p className="choice-preview">
          <span>Trong prompt:</span> <q lang="en">{kind === 'location' ? `Set in ${scene}.` : scene}</q>
        </p>
      )}
      <div className="field-head">
        <label className="field-label" htmlFor={ids.niche}>
          Ngách (tuỳ chọn)
        </label>
        <CharCount value={niche} max={MAX_CHOICE_NICHE} />
      </div>
      <input id={ids.niche} value={niche} maxLength={MAX_CHOICE_NICHE} placeholder="Ví dụ: Áo dài" onChange={(e) => setNiche(e.target.value)} />
      <Slot label="Ảnh minh hoạ (tuỳ chọn)" empty="Thêm 1 ảnh minh hoạ" inputLabel="Ảnh minh hoạ" images={photo} max={1} busy={busy} onAdd={(files) => void upload(files)} onRemove={() => setPhoto([])} onPick={(a) => setPhoto([a])} storeId={store?.id} />
      <Select label="Chia sẻ" icon="store" heading="Ai được dùng" value={share} options={shares} onChange={(v) => setShare(v as Share)} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="choice-form-actions">
        <button type="button" onClick={onCancel}>
          Huỷ
        </button>
        <button type="button" className="primary" disabled={busy || !name.trim() || !scene} onClick={() => void save()}>
          {busy ? 'Đang lưu…' : edit ? 'Lưu' : 'Lưu & chọn'}
        </button>
      </div>
    </div>
  );
}

/**
 * The dialog of one list: cards with the choice's sample loop (`marketing-<kind>-<id>`; without one, its photo, else for an often-used card the poster of
 * the member's latest clip with it) and name in a grid, the member's often-used group first when it has any, then by who shares them: each store's, the
 * company's, the member's own, the built-in ones. A store filter (the page's `storeId` first, or every store) and niche chips narrow the list. Arrows move
 * the focus between the cards, Enter or Space picks, Escape closes. Below: the footer (the variants row), the add form, and the member's own (for a
 * template editor also the shared ones) with edit and delete buttons, as PATCH and DELETE /api/choices/:id allow; `onEdited` follows a saved edit.
 */
export function ChoiceDialog({ open, title, sub, kind, choices, often, posters, canShare, stores, storeId, selected, onPick, onAdded, onEdited, onDelete, onClose, footer }: { open: boolean; title: string; sub: string; kind: ChoiceKind; choices: Choice[]; often: string[]; posters: Record<string, string>; canShare: boolean; stores: Store[]; storeId: string; selected: string[]; onPick: (id: string) => void; onAdded: (c: Choice) => void; onEdited: () => void; onDelete: (c: Choice) => void; onClose: () => void; footer?: ReactNode }) {
  const grid = useRef<HTMLDivElement>(null);
  const addCard = useRef<HTMLButtonElement>(null);
  const formHead = useId();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Choice | null>(null);
  /** The store filter: null follows the page's store; '' is every store. */
  const [store, setStore] = useState<string | null>(null);
  const [niche, setNiche] = useState('');
  useEffect(() => (setAdding(false), setEditing(null)), [open]);
  // Closed, the filters go back to the page's store and every niche, so the next opening starts from them.
  useEffect(() => {
    if (!open) (setStore(null), setNiche(''));
  }, [open]);
  const have = useSamples();
  // showModal (in Modal's effect, which runs first) focuses the close button, so the chosen card (else the first) takes the focus afterwards.
  useEffect(() => {
    if (open) (grid.current?.querySelector<HTMLElement>('[aria-selected=true]') ?? grid.current?.querySelector<HTMLElement>('[role=option]'))?.focus();
  }, [open]);
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(e.key in moves) && e.key !== 'Home' && e.key !== 'End') return;
    const cards = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=option]')];
    const at = cards.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? cards.length - 1 : (at + moves[e.key]! + cards.length) % cards.length;
    e.preventDefault();
    cards[next]?.focus();
  }
  const filter = store ?? storeId;
  const inStore = choices.filter((c) => c.group !== 'store' || !filter || c.storeId === filter);
  const niches = [...new Set(inStore.flatMap((c) => (c.niche ? [c.niche] : [])))].sort((a, b) => a.localeCompare(b, 'vi'));
  const shown = inStore.filter((c) => !niche || c.niche === niche);
  // Each card shows once: the often-used ones in their group, the rest in the group of who shares them.
  const top = often.flatMap((id) => shown.filter((c) => c.id === id));
  const rest = shown.filter((c) => !top.includes(c));
  const groups = [
    ...[...new Set(rest.filter((c) => c.group === 'store').map((c) => c.storeId))].map((id) => {
      const list = rest.filter((c) => c.group === 'store' && c.storeId === id);
      return { key: `store-${id}`, title: `Của cửa hàng ${list[0]!.storeName ?? ''}`, list };
    }),
    { key: 'company', title: 'Công ty', list: rest.filter((c) => c.group === 'company') },
    { key: 'mine', title: 'Của tôi', list: rest.filter((c) => c.group === 'mine') },
    { key: 'builtin', title: 'Có sẵn', list: rest.filter((c) => c.group === 'builtin') },
  ].filter((g) => g.list.length > 0);
  const first = top[0] ?? groups[0]?.list[0];
  const card = (c: Choice) => (
    <button key={c.id} type="button" role="option" aria-selected={selected.includes(c.id)} tabIndex={(selected.length > 0 ? selected[0] === c.id : c === first) ? 0 : -1} aria-label={c.name} aria-describedby={`${kind}-${c.id}-desc`} onClick={() => onPick(c.id)}>
      {open && <CardMedia {...cardSample(have, `marketing-${kind}-${c.id}`, c.imageAssetId ? `/api/assets/${c.imageAssetId}/content` : posters[c.id] && !have.has(`marketing-${kind}-${c.id}.mp4`) ? `/api/assets/${posters[c.id]}/content` : null)} />}
      <span className="choice-name">{c.name}</span>
      <span id={`${kind}-${c.id}-desc`} className="choice-desc">
        {c.desc}
      </span>
    </button>
  );
  const group = (key: string, label: string, list: Choice[]) => (
    <div key={key} role="group" aria-label={label} className="choice-group">
      <p className="choice-group-title" aria-hidden="true">
        {label}
      </p>
      {list.map(card)}
    </div>
  );
  const owned = shown.filter((c) => c.group !== 'builtin' && (c.mine || (canShare && (c.isCompany || c.storeId !== null))));
  const ownLabel = `${KIND_NAME[kind][0]!.toUpperCase()}${KIND_NAME[kind].slice(1)} của bạn`;
  const back = () => (setAdding(false), setEditing(null), requestAnimationFrame(() => addCard.current?.focus()));
  if (adding || editing) {
    const head = editing ? `Sửa ${KIND_NAME[kind]} ${editing.name}` : `Thêm ${KIND_NAME[kind]} của bạn`;
    // An edited store entry offers its own store as the store choice; a new one, the dialog's.
    const store = editing?.storeId ? { id: editing.storeId, name: editing.storeName ?? '' } : stores.find((s) => s.id === filter);
    return (
      <Modal open={open} onClose={onClose} label={head} className="choice-dialog">
        <h2 aria-labelledby={formHead}>
          <button type="button" className="photo-back" aria-label="Quay lại" onClick={back}>
            <Icon name="left" size={16} />
          </button>
          <span id={formHead}>{head}</span>
        </h2>
        <AddChoice kind={kind} canShare={canShare} store={store} niche={niche} edit={editing ?? undefined} onAdded={editing ? () => (onEdited(), back()) : onAdded} onCancel={back} />
      </Modal>
    );
  }
  return (
    <Modal open={open} onClose={onClose} label={title} className="choice-dialog">
      <h2>{title}</h2>
      <p className="modal-sub">{sub}</p>
      <div className="choice-filters">
        {stores.length > 0 && (
          <div className="uploads-filter">
            <Select label="Cửa hàng" icon="store" heading="Lọc theo cửa hàng" value={filter} options={[{ value: '', label: 'Tất cả cửa hàng' }, ...stores.map((s) => ({ value: s.id, label: s.name }))]} onChange={setStore} />
          </div>
        )}
        {niches.length > 0 && (
          <div className="kinds" role="group" aria-label="Ngách">
            {['', ...niches].map((n) => (
              <button key={n} type="button" aria-pressed={niche === n} onClick={() => setNiche(n)}>
                {n || 'Tất cả'}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* The listbox lays its cards out in the grid around it (display: contents), so the add card can close the grid without being an option. */}
      <div ref={grid} className="choice-grid">
        <div className="choice-options" role="listbox" aria-label={title} onKeyDown={onKey}>
          {/* As on Fash, no "none" card: the X on the chosen box clears it. */}
          {top.length > 0 && group('often', 'Hay dùng', top)}
          {groups.map((g) => group(g.key, g.title, g.list))}
        </div>
        <button ref={addCard} type="button" className="choice-add-card" onClick={() => setAdding(true)}>
          <Icon name="plus" size={20} />
          Thêm {KIND_NAME[kind]} của bạn
        </button>
      </div>
      {footer}
      {owned.length > 0 && (
        <section className="choice-own" aria-label={ownLabel}>
          <h3>{ownLabel}</h3>
          <ul className="template-list">
            {owned.map((c) => (
              <li key={c.id}>
                <span>{c.name}</span>
                {c.niche && <span className="tag">{c.niche}</span>}
                {c.isCompany && <span className="tag">Công ty</span>}
                {c.storeName && <span className="tag">Cửa hàng: {c.storeName}</span>}
                <button type="button" className="link-button" aria-label={`Sửa ${KIND_NAME[kind]} ${c.name}`} onClick={() => setEditing(c)}>
                  Sửa
                </button>
                <button type="button" className="link-button" aria-label={`Xoá ${KIND_NAME[kind]} ${c.name}`} onClick={() => onDelete(c)}>
                  Xoá
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Modal>
  );
}
