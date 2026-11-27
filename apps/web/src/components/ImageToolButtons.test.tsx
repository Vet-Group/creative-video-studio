import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { ImageToolButtons, resultTools } from './ImageToolButtons';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) })); // a static render has no app router

test('the print fix opens on the image results that may show a print and on a clip’s first frame, never on its own results, a cutout or an upscale', () => {
  for (const f of ['image', 'try_on', 'character_swap', 'model_swap', 'face_swap', 'background_changer', 'reframe', 'multi_angle', 'breed_swap', 'mockup_pack', 'name_swap', 'pose_generator', 'product_recolor', 'listing_set']) expect(resultTools(f), f).toContain('print-fix');
  for (const f of ['print_fix', 'background_remover', 'image_upscale', 'fashion_model', 'pet_portrait', 'jewelry_try_on', 'lingerie_try_on']) expect(resultTools(f), f).not.toContain('print-fix');
  // A clip's first frame opens in the print fix only: the other tools take a full picture.
  for (const f of ['video', 'marketing', 'motion_control', 'hook_effect', 'video_edit']) expect(resultTools(f, true), f).toEqual(['print-fix']);
  expect(resultTools('mockup_pack')).toEqual(['background-remover', 'image-upscale', 'background-changer', 'reframe', 'print-fix']);
  expect(resultTools('print_fix')).toEqual(['background-remover', 'image-upscale', 'background-changer', 'reframe']);
});

test('a clip’s frame gets one button, named by the app', () => {
  const html = renderToStaticMarkup(<ImageToolButtons assetId="poster-1" feature="video" video className="job-reuse" act={async () => undefined} />);
  expect(html.match(/<button/g)).toHaveLength(1);
  expect(html).toContain('class="job-reuse"');
  expect(html).toContain('Sửa lại hình in');
});
