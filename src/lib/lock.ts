// Local app lock: a salted PIN hash and an optional platform passkey (Face ID / Touch ID).
// This guards the open app on this device; the data itself is protected by Supabase auth + RLS.
const PIN_KEY = 'nekuda.pin'
const BIO_KEY = 'nekuda.bio'
const LOCK_AFTER_MS = 60_000

const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } },
  del: (k: string) => { try { localStorage.removeItem(k) } catch { /* ignore */ } },
}

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function hash(pin: string, salt: string) {
  const data = new TextEncoder().encode(`${salt}:${pin}`)
  // Iterate to make brute-forcing a leaked hash slower
  let buf: ArrayBuffer = await crypto.subtle.digest('SHA-256', data)
  for (let i = 0; i < 5000; i++) buf = await crypto.subtle.digest('SHA-256', buf)
  return b64(buf)
}

export const hasPin = () => !!store.get(PIN_KEY)

export async function setPin(pin: string) {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)))
  store.set(PIN_KEY, JSON.stringify({ salt, hash: await hash(pin, salt) }))
}

export async function checkPin(pin: string) {
  const raw = store.get(PIN_KEY)
  if (!raw) return true
  const { salt, hash: h } = JSON.parse(raw) as { salt: string; hash: string }
  return (await hash(pin, salt)) === h
}

export function clearLock() {
  store.del(PIN_KEY)
  store.del(BIO_KEY)
}

// ---- Biometric (WebAuthn platform authenticator) ----
export const bioSupported = async () =>
  !!window.PublicKeyCredential &&
  (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.().catch(() => false))

export const hasBio = () => !!store.get(BIO_KEY)

export async function enableBio(userName: string) {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'נקודה', id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: userName, displayName: userName },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60_000,
    },
  }) as PublicKeyCredential | null
  if (!cred) throw new Error('cancelled')
  store.set(BIO_KEY, b64(cred.rawId))
}

export function disableBio() { store.del(BIO_KEY) }

export async function verifyBio() {
  const id = store.get(BIO_KEY)
  if (!id) return false
  try {
    const res = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: unb64(id) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    return !!res
  } catch {
    return false
  }
}

// ---- When to lock ----
let hiddenAt = 0
export function watchVisibility(lock: () => void) {
  const on = () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now()
    else if (hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS && hasPin()) lock()
  }
  document.addEventListener('visibilitychange', on)
  return () => document.removeEventListener('visibilitychange', on)
}
