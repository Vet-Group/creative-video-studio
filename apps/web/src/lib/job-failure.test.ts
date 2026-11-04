import { expect, test } from 'vitest';
import { inputRefusal } from './job-failure';

const REAL_PERSON =
  'byteplus submit: HTTP 400 {"error":{"code":"InputImageSensitiveContentDetected.PrivacyInformation","message":"The request failed because the input image \'content[1]\' may contain real person. Request id: 0217","param":"content[1]","type":"BadRequest"}}';

test('a BytePlus real-person refusal is real_person, with the provider code as its detail', () => {
  expect(inputRefusal(REAL_PERSON)).toEqual({ reason: 'real_person', detail: 'byteplus · InputImageSensitiveContentDetected.PrivacyInformation' });
});

test('any other BytePlus input-image refusal is sensitive_input, as a create 400 or as a failed task', () => {
  expect(inputRefusal(REAL_PERSON.replace('.PrivacyInformation', '.Other'))).toEqual({ reason: 'sensitive_input', detail: 'byteplus · InputImageSensitiveContentDetected.Other' });
  expect(inputRefusal('InputImageSensitiveContentDetected: blocked')).toEqual({ reason: 'sensitive_input', detail: 'byteplus · InputImageSensitiveContentDetected' });
});

test('errors that are not input refusals, and no error at all, are null', () => {
  expect(inputRefusal('byteplus submit: HTTP 400 {"error":{"code":"InvalidParameter"}}')).toBeNull();
  expect(inputRefusal('OutputVideoSensitiveContentDetected: blocked')).toBeNull();
  expect(inputRefusal('submit failed: socket hang up')).toBeNull();
  expect(inputRefusal(null)).toBeNull();
});
