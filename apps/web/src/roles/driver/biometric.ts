// Fingerprint / Face ID unlock for the driver app, using the phone's own screen lock through WebAuthn
// (the same standard as passkeys). Works in Chrome on Android (also inside the installed Android app),
// in Safari and the home-screen app on iPhone, and with no signal.
//
// What it is: an app lock. The driver signs in with the password once; after that the phone asks for the
// fingerprint each time the app is opened (or comes back after 5 minutes in the background). The fingerprint
// never leaves the phone: the browser only tells us that the phone's owner was verified.
// What it is not: a way to sign in without the password on a new phone, or after the 12-hour session ends.

const KEY = 'waypoint.driver.biometric';
const UNLOCKED = 'waypoint.driver.unlockedAt';
/** Back in the app after this long in the background → ask again. */
export const RELOCK_AFTER_MS = 5 * 60_000;

type Saved = { userId: string; credentialId: string };

const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const challenge = () => crypto.getRandomValues(new Uint8Array(32));

const read = (): Saved | null => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; } };

/** Does this phone have a fingerprint / face sensor the browser can use? */
export async function biometricSupported(): Promise<boolean> {
  try {
    return !!window.PublicKeyCredential && window.isSecureContext && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

/** Turned on for this driver on this phone? */
export const biometricEnabled = (userId: string) => read()?.userId === userId;

/** Ask for the fingerprint once and remember this phone's key for the driver. */
export async function enableBiometric(user: { id: string; name: string }): Promise<void> {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: challenge(),
      rp: { name: 'Waypoint Connect' },
      user: { id: new TextEncoder().encode(user.id), name: user.name, displayName: user.name },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60_000,
      attestation: 'none',
    },
  }) as PublicKeyCredential | null;
  if (!cred) throw new Error('Fingerprint was not set up.');
  localStorage.setItem(KEY, JSON.stringify({ userId: user.id, credentialId: b64url(cred.rawId) } satisfies Saved));
  markUnlocked();
}

export function disableBiometric() {
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(UNLOCKED);
}

/** Show the phone's fingerprint prompt. Resolves true only if the phone verified its owner. */
export async function verifyBiometric(): Promise<boolean> {
  const saved = read();
  if (!saved) return false;
  const a = await navigator.credentials.get({
    publicKey: {
      challenge: challenge(),
      allowCredentials: [{ type: 'public-key', id: fromB64url(saved.credentialId), transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60_000,
    },
  }) as PublicKeyCredential | null;
  if (!a) return false;
  // Authenticator data byte 32 holds the flags; bit 2 (UV) = the fingerprint/face/PIN check passed.
  const data = new Uint8Array((a.response as AuthenticatorAssertionResponse).authenticatorData);
  const ok = a.id === saved.credentialId && (data[32]! & 0x04) !== 0;
  if (ok) markUnlocked();
  return ok;
}

export const markUnlocked = () => sessionStorage.setItem(UNLOCKED, String(Date.now()));
export const isUnlocked = () => !!sessionStorage.getItem(UNLOCKED);
export const lockNow = () => sessionStorage.removeItem(UNLOCKED);

/** Plain words for the errors browsers give. */
export function biometricError(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError') return 'Cancelled or not recognised. Try again.';
  if (name === 'InvalidStateError') return 'This phone is already set up. Turn fingerprint off and on again.';
  if (name === 'SecurityError') return 'Fingerprint needs the secure (https) address of the app.';
  return (e as Error)?.message || 'Fingerprint is not available right now.';
}
