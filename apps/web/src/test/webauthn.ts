// A software WebAuthn authenticator for the passkey tests: a real P-256 key, 'none' attestation and real assertion signatures,
// so the plugin's own @simplewebauthn/server checks run unmocked. Only the CBOR shapes WebAuthn needs are encoded.
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

type Cbor = number | string | Uint8Array | Map<Cbor, Cbor> | { [key: string]: Cbor };

function head(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  const b = Buffer.alloc(3);
  b[0] = (major << 5) | 25;
  b.writeUInt16BE(n, 1);
  return b;
}

function cbor(v: Cbor): Buffer {
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === 'string') return Buffer.concat([head(3, Buffer.byteLength(v)), Buffer.from(v)]);
  if (v instanceof Uint8Array) return Buffer.concat([head(2, v.length), Buffer.from(v)]);
  const entries = v instanceof Map ? [...v] : Object.entries(v);
  return Buffer.concat([head(5, entries.length), ...entries.flatMap(([k, x]) => [cbor(k), cbor(x)])]);
}

const b64url = (b: Buffer) => b.toString('base64url');
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest();

/** One credential bound to `origin`'s host as the rpID. `publicKey` is the base64 COSE key, as the plugin stores it. */
export function softAuthenticator(origin: string) {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const cose = cbor(new Map<Cbor, Cbor>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x!, 'base64url')], [-3, Buffer.from(jwk.y!, 'base64url')]]));
  const rawId = randomBytes(16);
  const id = b64url(rawId);
  const rpIdHash = sha256(new URL(origin).hostname);
  let count = 0;
  const counter = () => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(++count);
    return b;
  };
  const clientData = (type: string, challenge: string) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));

  return {
    id,
    publicKey: cose.toString('base64'),
    /** The browser's answer to generate-register-options: flags UP, UV and AT, an all-zero AAGUID, then the credential. */
    register(challenge: string) {
      const len = Buffer.alloc(2);
      len.writeUInt16BE(rawId.length);
      const authData = Buffer.concat([rpIdHash, Buffer.from([0x45]), counter(), Buffer.alloc(16), len, rawId, cose]);
      const attestationObject = cbor({ fmt: 'none', attStmt: {}, authData });
      return {
        id,
        rawId: id,
        type: 'public-key',
        response: { clientDataJSON: b64url(clientData('webauthn.create', challenge)), attestationObject: b64url(attestationObject), transports: ['internal'] },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      };
    },
    /** The browser's answer to generate-authenticate-options, signed with the credential's key. */
    authenticate(challenge: string) {
      const authData = Buffer.concat([rpIdHash, Buffer.from([0x05]), counter()]);
      const json = clientData('webauthn.get', challenge);
      const signature = sign('sha256', Buffer.concat([authData, sha256(json)]), privateKey);
      return {
        id,
        rawId: id,
        type: 'public-key',
        response: { clientDataJSON: b64url(json), authenticatorData: b64url(authData), signature: b64url(signature) },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      };
    },
  };
}
