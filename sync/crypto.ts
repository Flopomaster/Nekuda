// Node counterpart of src/lib/sealedBox.ts: opens credentials sealed in the browser.
import { createDecipheriv, createPrivateKey, privateDecrypt, constants } from 'node:crypto'

export type WorkerSecret = { u: string; t: string; k: string }

export function readWorkerSecret(raw: string | undefined): WorkerSecret {
  if (!raw) throw new Error('NEKUDA_SYNC_SECRET is not set')
  const s = JSON.parse(Buffer.from(raw.trim(), 'base64').toString('utf8')) as WorkerSecret
  if (!s.u || !s.t || !s.k) throw new Error('NEKUDA_SYNC_SECRET is malformed')
  return s
}

export function openSealed(privateKeyPkcs8B64: string, sealed: string): Record<string, string> {
  const box = JSON.parse(sealed) as { v: number; k: string; iv: string; d: string }
  if (box.v !== 1) throw new Error(`unsupported envelope version ${box.v}`)
  const key = createPrivateKey({ key: Buffer.from(privateKeyPkcs8B64, 'base64'), format: 'der', type: 'pkcs8' })
  const aesKey = privateDecrypt({ key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(box.k, 'base64'))
  const data = Buffer.from(box.d, 'base64')
  // WebCrypto appends the 16-byte GCM tag to the ciphertext
  const decipher = createDecipheriv('aes-256-gcm', aesKey, Buffer.from(box.iv, 'base64'))
  decipher.setAuthTag(data.subarray(data.length - 16))
  const plain = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()])
  return JSON.parse(plain.toString('utf8'))
}
