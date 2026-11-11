import logo from './vet-logo.png';

// The VET Group logo, the same file POD Studio shows (its components/shell/vet-logo.png); a plain <img>, as the file is tiny and square.
export function VetLogo({ size, label }: { size: number; label?: string }) {
  return <img className="vet-logo" src={logo.src} width={size} height={size} alt={label ?? ''} {...(label ? {} : { 'aria-hidden': true })} />;
}
