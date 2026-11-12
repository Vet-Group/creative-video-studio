import { type ChangeKind, KIND_LABEL } from '@/lib/changelog';

/** The coloured label of a changelog entry's kind (new, improved, fixed, ops). */
export const KindChip = ({ kind }: { kind: ChangeKind }) => (
  <span className="kind-chip" data-kind={kind}>
    {KIND_LABEL[kind]}
  </span>
);
