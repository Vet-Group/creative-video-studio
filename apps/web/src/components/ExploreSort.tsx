'use client';
// Explore's sort switch for the tools and the motion presets. The choice lives in the address (?sort=popular), so a reload or a shared link keeps it.
import { useRouter, useSearchParams } from 'next/navigation';

const OPTIONS = [
  { id: 'suggested', label: 'Gợi ý' },
  { id: 'popular', label: 'Đang được dùng nhiều' },
] as const;

export function ExploreSort({ sort }: { sort: (typeof OPTIONS)[number]['id'] }) {
  const router = useRouter();
  const search = useSearchParams();
  const choose = (id: string) => {
    const next = new URLSearchParams(search);
    if (id === 'popular') next.set('sort', id);
    else next.delete('sort');
    const qs = next.toString(); // not next.size: Safari before 17 has no URLSearchParams.size
    router.replace(qs ? `/explore?${qs}` : '/explore', { scroll: false });
  };
  return (
    <div className="kinds kinds-wrap explore-sort" role="group" aria-label="Sắp xếp công cụ và mẫu chuyển động">
      {OPTIONS.map((o) => (
        <button key={o.id} type="button" aria-pressed={sort === o.id} onClick={() => choose(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
