import { describe, expect, test } from 'vitest';
import { faceMatchLabel } from './face-match';

describe('faceMatchLabel', () => {
  test('names the level of a score and shows the number to 2 decimals', () => {
    expect(faceMatchLabel({ score: 0.72 })).toBe('Giống người mẫu: Cao (0.72)');
    expect(faceMatchLabel({ score: 0.5 })).toBe('Giống người mẫu: Cao (0.50)');
    expect(faceMatchLabel({ score: 0.49 })).toBe('Giống người mẫu: Vừa (0.49)');
    expect(faceMatchLabel({ score: 0.37 })).toBe('Giống người mẫu: Vừa (0.37)');
    expect(faceMatchLabel({ score: 0.36 })).toBe('Giống người mẫu: Thấp (0.36)');
    expect(faceMatchLabel({ score: -0.05 })).toBe('Giống người mẫu: Thấp (-0.05)');
  });

  test('says which photo had no face, and nothing when there is no score', () => {
    expect(faceMatchLabel({ noFace: 'result' })).toBe('Giống người mẫu: không thấy mặt');
    expect(faceMatchLabel({ noFace: 'model' })).toBe('Giống người mẫu: ảnh người mẫu không rõ mặt');
    expect(faceMatchLabel(null)).toBeNull();
    expect(faceMatchLabel(undefined)).toBeNull();
  });
});
