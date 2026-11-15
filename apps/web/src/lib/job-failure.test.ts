import { expect, test } from 'vitest';
import { providerRefusal } from './job-failure';

const REAL_PERSON =
  'byteplus submit: HTTP 400 {"error":{"code":"InputImageSensitiveContentDetected.PrivacyInformation","message":"The request failed because the input image \'content[1]\' may contain real person. Request id: 0217","param":"content[1]","type":"BadRequest"}}';

test('a BytePlus real-person refusal is real_person, with the provider code as its detail', () => {
  expect(providerRefusal(REAL_PERSON)).toEqual({ reason: 'real_person', detail: 'byteplus · InputImageSensitiveContentDetected.PrivacyInformation' });
});

test('any other BytePlus input-image refusal is sensitive_input, as a create 400 or as a failed task', () => {
  expect(providerRefusal(REAL_PERSON.replace('.PrivacyInformation', '.Other'))).toEqual({ reason: 'sensitive_input', detail: 'byteplus · InputImageSensitiveContentDetected.Other' });
  expect(providerRefusal('InputImageSensitiveContentDetected: blocked')).toEqual({ reason: 'sensitive_input', detail: 'byteplus · InputImageSensitiveContentDetected' });
});

test('errors that are not input refusals, and no error at all, are null', () => {
  expect(providerRefusal('byteplus submit: HTTP 400 {"error":{"code":"InvalidParameter"}}')).toBeNull();
  expect(providerRefusal('OutputVideoSensitiveContentDetected: blocked')).toBeNull();
  expect(providerRefusal('submit failed: socket hang up')).toBeNull();
  expect(providerRefusal(null)).toBeNull();
});

test('a BytePlus refusal of the sound a clip made is output_audio, before any input refusal it might quote', () => {
  const audio = 'byteplus status: OutputAudioSensitiveContentDetected.PolicyViolation: The request failed because the output audio may be related to copyright restrictions. Request id: 0217';
  expect(providerRefusal(audio)).toEqual({ reason: 'output_audio', detail: 'byteplus · OutputAudioSensitiveContentDetected.PolicyViolation' });
  expect(providerRefusal('OutputAudioSensitiveContentDetected')).toEqual({ reason: 'output_audio', detail: 'byteplus · OutputAudioSensitiveContentDetected' });
});

const FAL_REAL_PERSON =
  'fal result: HTTP 422 {"detail":[{"loc":["body","image_url"],"msg":"The images or videos provided may contain likenesses of real people or other private information that cannot be processed.","type":"content_policy_violation","url":"https://docs.fal.ai/errors#content_policy_violation","ctx":{"extra_info":{"reason":"partner_validation_failed"}},"input":"data:image/jpeg;base64,<truncated>","categories":["model_moderated"]}]}';

test('a fal content_policy_violation about likenesses of real people is real_person', () => {
  expect(providerRefusal(FAL_REAL_PERSON)).toEqual({ reason: 'real_person', detail: 'fal · content_policy_violation' });
});

test('a Motion Control 422 names what it could not read: the upper body in the image or the video, or too little motion', () => {
  const msg = (m: string) => `fal result: HTTP 422 {"detail":[{"loc":["body"],"msg":"${m}","type":"value_error"}]}`;
  expect(providerRefusal(msg('Image recognition failed. Please make sure your image meets the requirements. Error: No complete upper body detected in the image; ensure the upper body is clearly visible.'))).toEqual({ reason: 'upper_body_image', detail: 'fal · no complete upper body in the image' });
  expect(providerRefusal(msg('The input was rejected, No complete upper body detected in the video; ensure the upper body is clearly visible.'))).toEqual({ reason: 'upper_body_video', detail: 'fal · no complete upper body in the video' });
  expect(providerRefusal(msg('The input was rejected, The duration of continuous valid motion is too short; it should last at least 3 second.'))).toEqual({ reason: 'motion_short', detail: 'fal · motion too short' });
  expect(providerRefusal(msg('Tail image without first image is not supported'))).toBeNull();
});

test('any other fal content_policy_violation is sensitive_input', () => {
  const other = FAL_REAL_PERSON.replace('may contain likenesses of real people or other private information', 'may contain content that cannot be processed');
  expect(providerRefusal(other)).toEqual({ reason: 'sensitive_input', detail: 'fal · content_policy_violation' });
  expect(providerRefusal('fal result: HTTP 422 {"detail":[{"type":"value_error"}]}')).toBeNull();
});
