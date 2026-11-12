import { describe, expect, test } from 'vitest';
import { isBillingDisabled } from './vertex-billing-disabled';

describe('isBillingDisabled', () => {
  test.each([
    'vertex: HTTP 403 {"error":{"code":403,"message":"This API method requires billing to be enabled. Please enable billing on project #cvs-vertex by visiting https://console.developers.google.com/billing/enable?project=cvs-vertex then retry.","status":"PERMISSION_DENIED"}}',
    'Vertex Veo: HTTP 403 {"error":{"details":[{"reason":"BILLING_DISABLED"}]}}',
    'The billing account for the owning project is closed.',
    'the Billing Account projects/1 is disabled',
  ])('is true for %s', (m) => expect(isBillingDisabled(m)).toBe(true));

  test.each([
    'vertex: HTTP 403 {"error":{"code":403,"message":"Permission \'aiplatform.endpoints.predict\' denied on resource","status":"PERMISSION_DENIED"}}',
    'vertex: HTTP 429 {"error":{"code":429,"message":"Quota exceeded for aiplatform.googleapis.com","status":"RESOURCE_EXHAUSTED"}}',
    'vertex: HTTP 403 {"error":{"message":"Request blocked by safety filters"}}',
    'billing export: no access',
    '',
    null,
    undefined,
  ])('is false for %s', (m) => expect(isBillingDisabled(m)).toBe(false));
});
