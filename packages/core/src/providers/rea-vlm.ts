// Builds the environment rea-video's VLM step reads (REA_VLM_BASE_URL / REA_VLM_API_KEY / REA_VLM_MODEL).
//
// These are passed to the `rea-video` child process via its `env` and never written to disk: the CLI
// reads them with os.getenv (rea_video/vlm.py), so an env file would only add an on-disk secret to
// clean up. rea-video POSTs to `{REA_VLM_BASE_URL}/chat/completions`.
//
// Default provider is BytePlus Ark with a static key. The fallback is Vertex Gemini's OpenAI-compatible
// endpoint, whose `apiKey` is a short-lived OAuth access token (valid ~1h, longer than a decompose run,
// so one token minted per job is enough — no refresh proxy). Minting the token and probing BytePlus
// reachability are the caller's async concern; this module stays pure so it is unit-testable.

export interface ReaVlm {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const ARK_BASE = 'https://ark.ap-southeast.bytepluses.com/api/v3';
const ARK_MODEL = 'seed-2-0-lite-260428';
const VERTEX_MODEL = 'google/gemini-2.5-flash';

export const byteplusReaVlm = (apiKey: string, model: string = ARK_MODEL): ReaVlm => ({ baseUrl: ARK_BASE, apiKey, model });

export function vertexReaVlm(opts: { project: string; location: string; token: string; model?: string }): ReaVlm {
  const host = opts.location === 'global' ? 'https://aiplatform.googleapis.com' : `https://${opts.location}-aiplatform.googleapis.com`;
  return { baseUrl: `${host}/v1beta1/projects/${opts.project}/locations/${opts.location}/endpoints/openapi`, apiKey: opts.token, model: opts.model ?? VERTEX_MODEL };
}

export const reaVlmEnv = (v: ReaVlm): Record<string, string> => ({ REA_VLM_BASE_URL: v.baseUrl, REA_VLM_API_KEY: v.apiKey, REA_VLM_MODEL: v.model });

// BytePlus when its key is configured and reachable, else the Vertex fallback; if only one is
// configured, use it. The reachability of BytePlus is probed by the caller. `vertex` is a thunk so
// the caller mints the Vertex OAuth token only when Vertex is actually chosen, not on the common
// BytePlus-reachable path.
export function pickReaVlm(opts: { byteplus?: ReaVlm; vertex?: () => ReaVlm; byteplusReachable: boolean }): ReaVlm {
  if (opts.byteplus && opts.byteplusReachable) return opts.byteplus;
  if (opts.vertex) return opts.vertex();
  if (opts.byteplus) return opts.byteplus;
  throw new Error('no VLM provider configured for rea-video');
}
