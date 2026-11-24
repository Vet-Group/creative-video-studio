import type { TrayJob } from './api';

/** SFace's published cosine threshold for two photos of the same person; below it the faces are taken for different people. */
export const FACE_SAME_PERSON = 0.363;
/** From this score on a result reads as clearly the same person (frontal results scored 0.72 to 0.92, three-quarter views 0.60 to 0.68). */
export const FACE_CLEARLY_SAME = 0.5;

/** The one line a pose generator card shows for the job's face score against its model photo, in words as well as the number; null when there is nothing to say. */
export function faceMatchLabel(match: TrayJob['faceMatch'] | undefined): string | null {
  if (!match) return null;
  if ('noFace' in match) return match.noFace === 'model' ? 'Giống người mẫu: ảnh người mẫu không rõ mặt' : 'Giống người mẫu: không thấy mặt';
  const level = match.score >= FACE_CLEARLY_SAME ? 'Cao' : match.score >= FACE_SAME_PERSON ? 'Vừa' : 'Thấp';
  return `Giống người mẫu: ${level} (${match.score.toFixed(2)})`;
}
