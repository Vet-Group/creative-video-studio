# Bake-off rubric

Judge each clip against its source image. A clip fails if any one of the five faults below holds. Judge what you see; do not guess which model made a clip.

Each clip folder holds `clip.mp4`, `frame-1.jpg` to `frame-8.jpg` (evenly spaced frames of the clip) and `source.<ext>` (the image the clip was made from).

## Faults

The fault codes are the values used in the `faults` column of the scores file.

1. `print` - The print, text or logo is warped or changed.
   Fail example: the letters of a mug logo bend, melt or change spelling during the clip.
2. `colour` - The product colour is clearly off from the source image.
   Fail example: a red shirt turns orange or pink, or a black bag turns grey.
3. `deformed` - The product is deformed or gains extra details.
   Fail example: a plain tumbler grows a handle, or a shirt gains pockets or buttons that the source does not have.
4. `flicker` - There is flicker or judder (this code covers both).
   Fail example: the brightness pulses, or the product jumps or stutters between frames. The motion metrics flag candidates; confirm them by eye.
5. `stray-text` - Stray text or a watermark appears.
   Fail example: a caption, a subtitle or a provider watermark shows in a corner.

## Scores file

Write `scores-<set>.csv` with the header `id,pass,faults,note`, one row per clip.

- `id`: the clip folder name, for example `clip-1a2b3c4d`.
- `pass`: `true` when none of the five faults holds, otherwise `false`.
- `faults`: empty when `pass` is `true`; otherwise one or more fault codes separated by `;`.
- `note`: one short sentence of evidence. Quote it with double quotes if it contains a comma.

## Motion thresholds

Status: provisional, calibrated at B.5a on 2026-10-24; they do not change after that. While a value is empty, `metrics.ts` flags nothing for that measure.

Calibration: both canary clips showed no flicker or judder when checked frame by frame (Kling o3 Pro 1080x1920: mean 0.093, p99 1.377; Seedance 2.5 720x1280: mean 0.415, p99 2.677; mock sample: mean 0.005, p99 0.023). Each threshold is twice the highest clean value, rounded.

- flicker_mean_max: 0.8
- judder_p99_max: 5.4
