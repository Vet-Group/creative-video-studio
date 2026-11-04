import { type RouteContext } from '@/lib/assets';
import { patchPreset } from '@/lib/presets';

/** Admin: edit a preset's `label`, `prompt` and `sortOrder`, or switch it on or off with `enabled`. The old and new values of what changed are audited as preset.update. */
export async function PATCH(request: Request, { params }: RouteContext) {
  return patchPreset(request, (await params).id, 'admin');
}
