import { type RouteContext } from '@/lib/assets';
import { patchPreset } from '@/lib/presets';

/** Template editor: edit one preset as an Admin does at /admin/presets, with the same checks and preset.update audit. */
export async function PATCH(request: Request, { params }: RouteContext) {
  return patchPreset(request, (await params).id, 'editor');
}
