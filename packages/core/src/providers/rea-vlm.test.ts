import { expect, test } from 'vitest';
import { byteplusReaVlm, pickReaVlm, reaVlmEnv, vertexReaVlm } from './rea-vlm';

test('BytePlus config targets the Ark OpenAI-compatible base and the seed vision model', () => {
  const v = byteplusReaVlm('ark-key');
  expect(v).toEqual({ baseUrl: 'https://ark.ap-southeast.bytepluses.com/api/v3', apiKey: 'ark-key', model: 'seed-2-0-lite-260428' });
  expect(reaVlmEnv(v)).toEqual({ REA_VLM_BASE_URL: 'https://ark.ap-southeast.bytepluses.com/api/v3', REA_VLM_API_KEY: 'ark-key', REA_VLM_MODEL: 'seed-2-0-lite-260428' });
});

test('Vertex config builds the openapi endpoint and carries the OAuth token as the key', () => {
  const global = vertexReaVlm({ project: 'cvs-vertex', location: 'global', token: 'tok' });
  expect(global.baseUrl).toBe('https://aiplatform.googleapis.com/v1beta1/projects/cvs-vertex/locations/global/endpoints/openapi');
  expect(global.apiKey).toBe('tok');
  expect(global.model).toBe('google/gemini-2.5-flash');
  const region = vertexReaVlm({ project: 'cvs-vertex', location: 'us-central1', token: 'tok' });
  expect(region.baseUrl).toBe('https://us-central1-aiplatform.googleapis.com/v1beta1/projects/cvs-vertex/locations/us-central1/endpoints/openapi');
});

test('BytePlus model is overridable', () => {
  expect(byteplusReaVlm('k', 'seed-x').model).toBe('seed-x');
});

test('picks BytePlus when reachable, Vertex when not, and mints the Vertex thunk only when chosen', () => {
  const bp = byteplusReaVlm('k');
  const vx = vertexReaVlm({ project: 'p', location: 'global', token: 't' });
  let minted = 0;
  const vertex = () => {
    minted++;
    return vx;
  };
  expect(pickReaVlm({ byteplus: bp, vertex, byteplusReachable: true })).toBe(bp);
  expect(minted).toBe(0); // BytePlus wins: the Vertex token is never minted
  expect(pickReaVlm({ byteplus: bp, vertex, byteplusReachable: false })).toBe(vx);
  expect(minted).toBe(1);
  expect(pickReaVlm({ byteplus: bp, byteplusReachable: false })).toBe(bp);
  expect(pickReaVlm({ vertex, byteplusReachable: false })).toBe(vx);
  expect(() => pickReaVlm({ byteplusReachable: false })).toThrow(/no VLM provider/);
});
