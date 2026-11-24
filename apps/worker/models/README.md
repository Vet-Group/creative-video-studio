# Face models

Used by `src/face.ts` for the pose generator's model consistency score (YuNet finds the face, SFace turns it into a feature, the score is their cosine).
Both come unmodified from <https://github.com/opencv/opencv_zoo>. Do not swap in InsightFace/ArcFace weights: their licence is non-commercial.

| File | Source in opencv_zoo | Licence | sha256 |
|---|---|---|---|
| `face_detection_yunet_2023mar.onnx` | `models/face_detection_yunet` | MIT | `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` |
| `face_recognition_sface_2021dec_int8.onnx` | `models/face_recognition_sface` | Apache-2.0 | `2b0e941e6f16cc048c20aee0c8e31f569118f65d702914540f7bfdc14048d78a` |

SFace is the int8 build (9.9 MB, against 37 MB for fp32): on our images its score is within +-0.06 of the fp32 one, which moves a High / Medium / Low label by at most one step at the edges.
`src/face.test.ts` checks the hashes above.
