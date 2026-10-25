# Example clip fixtures

Synthetic test patterns (ffmpeg `testsrc2`, 2 s loops, a few tens of KB each) with a first-frame JPEG poster.
They stand in for company clips on the Create page's Examples tab until bake-off outputs exist, and the UI marks them as fixtures.
They come in four shapes (16:9, 1:1, 3:4 and 9:16) so the Examples grid has tiles of different heights.
They are made by `apps/worker/src/example-fixtures.test.ts`. No third-party footage is used.

On a running install an Admin can replace any of these with a real sample: `PUT /api/admin/samples/example-3.mp4` (or `.jpg` for the poster) stores the file under `samples/` in the bucket, outside Git, and the pages use it instead of the fixture. The same names cover the Explore cards (`feature-<page>.jpg`, `model-<id>.jpg`) and the app art (`app-<slug>.jpg`); see `src/lib/samples.ts`. `DELETE` brings the fixture back.
