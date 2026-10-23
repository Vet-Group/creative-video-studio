# Production host (VET) — read-only check

Plan step D.3, run on 2026-10-23 at 07:42 UTC with `bash scripts/run/vet.sh check` (the gate key, verb `check`; nothing was
changed on the host). The raw output is the run log `.omc/run/logs/vet-check-20261023T074212Z.log` (local, not in Git).

## Results

| Item | Value |
|---|---|
| Ports this app needs (3400, 5435, 9400, 9401) | all free |
| Ports in use on 127.0.0.1 | 3100 and 3300 (Next.js), 5433, 9300, 9301, 19000, 19001, 54316 (Docker), 20241–20243 (three `cloudflared`), 631, 37533; LAN: 22, 3101 |
| RAM | 15 GiB total, 4.6 GiB used, 10 GiB available; swap 4 GiB, 437 MiB used |
| Disk `/` | 233 GB, 63 GB used (29%), 158 GB free |
| `user@0.service` | `MemoryMax=5368709120` (5 GiB); `memory.current` 1,921,077,248 bytes (1.79 GiB); no CPU quota printed |
| Containers | `ideas-hub-minio-1`, `ideas-hub-postgres-1`, `pod-studio-postgres-1`, `pod-studio-minio-1`, all healthy |
| Root user units | `ideashub-web` (port 3300), `ideashub-worker`, `ideashub-tunnel`, `ideashub-xvfb`, `ideashub-deploy` and five `ideashub-*` timers; no `cvs-*` unit |
| System Node | v22.22.1 (this app installs its own pinned Node 24.22.1 under `/opt/creative-video-studio/node`, so there is no clash) |

## Decision: `MemoryMax`

`cvs-web` and `cvs-worker` keep `MemoryMax=768M` each. Both run in `user@0.service`, whose cap is 5 GiB; Ideas Hub and the other
root user units use 1.79 GiB now, so the worst case is 1.79 + 1.5 = 3.29 GiB, leaving about 1.7 GiB for Ideas Hub to grow. The
app's Postgres and MinIO run under `docker.service`, outside that cap, and the host has 10 GiB available.

## Open item

The plan asks D.3 to read Ideas Hub ADR 0007 ("backup and drill stay disabled") and record whether its reason applies here.
The run cannot read the Ideas Hub repository, so this is left to the owner before `cvs-backup.timer` is relied on.
