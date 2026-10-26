// The VET Group "V" tile (company asset, same shapes as the ERP's vet-workspace-logo.svg); colours come from the brand tokens.
export function VetLogo({ size, label }: { size: number; label?: string }) {
  return (
    <svg className="vet-logo" viewBox="0 0 64 64" width={size} height={size} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <rect className="vet-logo-tile" width="64" height="64" rx="14" />
      <path className="vet-logo-mark" d="M14 20h9l9 22 9-22h9L36 50h-8z" />
    </svg>
  );
}
