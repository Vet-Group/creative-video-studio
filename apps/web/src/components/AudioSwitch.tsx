import { useId } from 'react';

/**
 * The native-audio switch of Create video and Marketing Studio, on by default as on the reference site. `available` is false while no model is chosen
 * or when the chosen model cannot make audio (its audioEstimateUsd is null); the switch then reads off and does not move. `always` is true on a model
 * that always makes sound (its alwaysAudio); the switch then reads on and does not move. A `reason` (a model that is silent in the way the form is set) holds the
 * switch off and shows the reason under it.
 */
export function AudioSwitch({ on, available, always = false, reason, onChange }: { on: boolean; available: boolean; always?: boolean; reason?: string; onChange: (on: boolean) => void }) {
  const id = useId();
  const shown = (on || always) && available && !reason;
  const why = reason ?? (!available ? 'Mô hình này không tạo được âm thanh' : always ? 'Mô hình này luôn tạo âm thanh' : null);
  return (
    <div className="field">
      {/* A label, so a click on it flips the switch; a fixed switch says why on hover. */}
      <label className="field-label" id={id} htmlFor={`${id}-switch`}>
        Tạo âm thanh
      </label>
      <span className="switch-row" title={why ?? undefined}>
        <button type="button" id={`${id}-switch`} role="switch" className="switch" aria-checked={shown} aria-labelledby={id} aria-describedby={why ? `${id}-why` : undefined} disabled={why !== null} onClick={() => onChange(!on)} />
        <span>{shown ? 'Bật' : 'Tắt'}</span>
        {why && (
          <span id={`${id}-why`} className="sr-only">
            {why}
          </span>
        )}
      </span>
      {reason && <p className="help">{reason}</p>}
    </div>
  );
}
