import { describe, expect, it } from 'vitest';
import { usable } from './fashion-models';
import { AI_MODEL_SLOTS, UPLOAD_SLOTS, type UploadSlot } from './upload-slots';

describe('usable', () => {
  it('keeps the models the caller can run a job with: their own and the shared ones, not another member’s private model an Admin sees', () => {
    const models = [{ id: 'own', mine: true, shared: false }, { id: 'shared', mine: false, shared: true }, { id: 'theirs', mine: false, shared: false }];
    expect(usable(models).map((m) => m.id)).toEqual(['own', 'shared']);
  });
});

describe('AI_MODEL_SLOTS', () => {
  it('offers the AI models on person and general picture slots and a box of no slot, not on garments, backgrounds, products, packaging, end frames or illustrations', () => {
    expect(AI_MODEL_SLOTS.filter((s): s is UploadSlot => s !== undefined)).toEqual(['model', 'reference', 'video', 'image']);
    expect(AI_MODEL_SLOTS).toContain(undefined);
    for (const slot of ['garment', 'background', 'product', 'packaging', 'end-frame', 'illustration'] as const) expect(AI_MODEL_SLOTS).not.toContain(slot);
    for (const slot of AI_MODEL_SLOTS) if (slot) expect(UPLOAD_SLOTS).toHaveProperty(slot);
  });
});
