# Research gaps — Creative Video Studio

Only the gaps that change the build are listed. The app calls its own providers, so the internal contract of Fash (hubs, endpoints, schemas) is **not** needed and is not listed.

| ID | Question | Why it matters | Evidence needed | Who | Paid job? |
|---|---|---|---|---|---|
| R1 | Does better-auth's generic OAuth work with Lark/Larksuite OAuth, including the token and user-info endpoints? | Q4 login | Lark open-platform docs, plus a spike against a test app in the tenant | Developer; the owner creates the Lark app | No |
| R2 | Do Replicate (with the Seedance marketplace terms) and fal (with the API supplemental terms and DPA) satisfy Q6: no training on inputs or outputs, short retention? | A Milestone 1 candidate may be replaced | The full text of: the Replicate "Resultant Data" definition, the ByteDance/Seedance model terms on Replicate, the fal API Services supplemental terms, the fal DPA | Developer | No — **done 2026-10-22.** Both candidates pass at the platform layer: fal through its explicit no-training commitment (the endpoint is "Enterprise Ready"), Replicate through the licence scope plus 1-hour deletion. The residual risk is that the model owner (Kuaishou or ByteDance) is not bound. Details in ARCHITECTURE "Data terms check". |
| R3 | Real API input schema per model: number of reference images, aspect ratios, durations, resolution, and whether a first frame differs from a reference image | Model limits in the adapter, and the form validation | The provider API reference or OpenAPI schema for `fal-ai/kling-video/o3/pro/reference-to-video` and the Replicate Seedance 2.5 model | Developer | No |
| R4 | Free ports, RAM and disk on the VET Linux server | Can it hold one more Postgres and MinIO? | Read-only `ss`, `free` and `df` over the `vet-linux` profile | Read-only, under the pre-approval | No |
| R5 | Real render time, failure rate and quality per candidate on company inputs | Picking the model and the 10-minute timeout | The Milestone 1 bake-off | The bake-off run with the AI judge | **Yes, at most $40** |

## Optional Fash UX checks (browser checks; not blocking)

These only refine the look of states the PRD already defines. They are not needed to build or to pass acceptance. Visual and motion parity itself is required since 2026-10-23 (change request UI-PARITY, run step M.7, `docs/UI-MOTION-PARITY.md`); it is built from the audit evidence and needs neither check.

| ID | Question | Paid? |
|---|---|---|
| F1 | When the model changes on Create Videos, which fields hide or change, and when does Run become enabled? | No |
| F2 | What do the in-progress state and a populated Library video card look like? | Yes: 1 Fash job, only with an agreed credit budget |

Defaults if F1 and F2 are never done: the PRD state list stands and the UI shows only what the selected model supports, as found in R3.
