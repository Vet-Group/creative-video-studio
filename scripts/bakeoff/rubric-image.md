# Image rubric (product photo restyle)

Judge each image against its source photo. The task given to every model was: put the product on a tidy wooden table in a bright, cozy room with natural daylight, keeping the product, its shape, colours and printed text exactly unchanged, with no added text, logos or watermarks. An image fails if any one of the four faults below holds. Judge what you see; do not guess which model made an image.

Each folder holds `image.png` (the result) and `source.<ext>` (the photo it was made from).

## Faults

The fault codes are the values used in the `faults` column of the scores file. They are the five faults of `rubric.md` (video) minus `flicker`, which a still image cannot have.

1. `print` - The print, text or logo is warped or changed.
   Fail example: the letters of a logo bend, melt or change spelling.
2. `colour` - The product colour is clearly off from the source photo.
   Fail example: a red shirt turns orange or pink, or a black item turns grey.
3. `deformed` - The product is deformed or gains extra details.
   Fail example: a plain ornament grows a hook it did not have, or a shirt gains pockets or buttons that the source does not have.
4. `stray-text` - Stray text or a watermark appears.
   Fail example: a caption, a sign with writing or a provider watermark shows anywhere.

## Scores file

Write `scores-replicate-2026-11-images.csv` with the header `id,pass,faults,note`, one row per folder.

- `id`: the folder name, for example `image-1a2b3c4d`.
- `pass`: `true` when none of the four faults holds, otherwise `false`.
- `faults`: empty when `pass` is `true`; otherwise one or more fault codes separated by `;`.
- `note`: one short sentence of evidence. Quote it with double quotes if it contains a comma.
