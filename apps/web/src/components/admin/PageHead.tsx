import type { ReactNode, Ref } from 'react';
import { Icon } from '@/components/Icon';

/** An Admin page's title with its one-line description, and the page-wide controls (month, CSV) on the right. `headRef` makes the title focusable, for a page that moves focus to it. */
export function PageHead({ id, title, lead, children, headRef }: { id: string; title: string; lead: ReactNode; children?: ReactNode; headRef?: Ref<HTMLHeadingElement> }) {
  return (
    <header className="admin-head">
      <div>
        <h1 id={id} ref={headRef} tabIndex={headRef ? -1 : undefined}>
          {title}
        </h1>
        <p>{lead}</p>
      </div>
      {children && <div className="admin-head-tools">{children}</div>}
    </header>
  );
}

/** What a page or table shows when it has nothing to list. */
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="admin-empty">
      <Icon name="film" size={18} />
      <p className="admin-empty-title">{title}</p>
      {children && <p>{children}</p>}
    </div>
  );
}
