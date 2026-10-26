import { useId } from 'react';

/**
 * The native-audio switch of Create video and Marketing Studio, on by default as on the reference site. `available` is false while no model is chosen
 * or when the chosen model cannot make audio (its audioEstimateUsd is null); the switch then reads off and does not move.
 */
export function AudioSwitch({ on, available, onChange }: { on: boolean; available: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  const shown = on && available;
  return (
    <div className="field">
      <span className="field-label" id={id}>
        Tạo âm thanh
      </span>
      <span className="switch-row">
        <button type="button" role="switch" className="switch" aria-checked={shown} aria-labelledby={id} aria-describedby={available ? undefined : `${id}-why`} disabled={!available} onClick={() => onChange(!on)} />
        <span>{shown ? 'Bật' : 'Tắt'}</span>
        {!available && (
          <span id={`${id}-why`} className="sr-only">
            Mô hình này không tạo được âm thanh
          </span>
        )}
      </span>
    </div>
  );
}
