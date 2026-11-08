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
