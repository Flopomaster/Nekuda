// Hybrid public-key encryption for bank credentials (WebCrypto).
// A fresh AES-256-GCM key encrypts the data; RSA-OAEP (SHA-256) wraps that key with the sync
// public key. Only the nightly worker holds the private key (sync/crypto.ts decrypts).
const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' } as const

export async function sealWithPublicKey(publicKeySpkiB64: string, data: unknown): Promise<string> {
  const pub = await crypto.subtle.importKey('spki', unb64(publicKeySpkiB64), RSA, false, ['wrapKey'])
  const aes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(JSON.stringify(data)))
  const wrapped = await crypto.subtle.wrapKey('raw', aes, pub, RSA)
  return JSON.stringify({ v: 1, k: b64(wrapped), iv: b64(iv), d: b64(ct) })
}

/** One-time setup: a new RSA key pair plus a random API token for the worker. */
export async function generateSyncKeys() {
  const pair = await crypto.subtle.generateKey(
    { ...RSA, modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['wrapKey', 'unwrapKey'],
  )
  const publicKey = b64(await crypto.subtle.exportKey('spki', pair.publicKey))
  const privateKey = b64(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, '')
  const tokenHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))]
    .map((b) => b.toString(16).padStart(2, '0')).join('')
  return { publicKey, privateKey, token, tokenHash }
}

/** Everything the worker needs, as one value to paste into a GitHub secret. */
export const packWorkerSecret = (functionUrl: string, token: string, privateKey: string) =>
  btoa(JSON.stringify({ u: functionUrl, t: token, k: privateKey }))
