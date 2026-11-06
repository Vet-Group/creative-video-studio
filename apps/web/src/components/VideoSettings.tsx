import { type ReactNode, useId } from 'react';

/** The video's own settings on Create and Marketing Studio (ratio, length, sound, model) under one visible title. */
export function VideoSettings({ children }: { children: ReactNode }) {
  const id = useId();
  return (
    <div className="video-settings" role="group" aria-labelledby={id}>
      <p id={id} className="video-settings-title">
        Cài đặt video
      </p>
      {children}
    </div>
  );
}
