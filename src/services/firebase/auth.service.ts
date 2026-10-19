import {
  deleteUser,
  onAuthStateChanged,
  signInWithPhoneNumber,
  signOut,
  type ConfirmationResult,
  type User as FirebaseUser,
  type UserCredential,
} from '@react-native-firebase/auth';

import { auth } from '@/config/firebase';
import { deleteUserProfile } from '@/services/firebase/user.service';
import { formatIndianPhone, validateIndianPhone } from '@/utils/phone.utils';

/**
 * An error whose message doubles as an i18n key, so a screen can render
 * `t(error.i18nKey)` without re-mapping Firebase error codes itself.
 */
export class AuthError extends Error {
  public readonly i18nKey: string;
  public readonly code: string | undefined;

  public constructor(i18nKey: string, code?: string) {
    super(i18nKey);
    this.name = 'AuthError';
    this.i18nKey = i18nKey;
    this.code = code;
  }
}

const FIREBASE_ERROR_TO_I18N: Record<string, string> = {
  'auth/invalid-phone-number': 'auth.phoneInvalid',
  'auth/too-many-requests': 'auth.tooManyRequests',
  'auth/invalid-verification-code': 'auth.otpInvalid',
  'auth/code-expired': 'auth.otpExpired',
  'auth/user-disabled': 'errors.sessionExpired',
  'auth/requires-recent-login': 'errors.sessionExpired',
  'auth/network-request-failed': 'errors.networkError',
};

/** Reads a `.code` string off an unknown thrown value, if it has one. */
function firebaseErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code: unknown = error.code;
    if (typeof code === 'string') return code;
  }
  return 'unknown';
}

/** Turns a Firebase auth error code into an {@link AuthError} carrying an i18n key. */
export function mapFirebaseAuthError(code: string): AuthError {
  return new AuthError(FIREBASE_ERROR_TO_I18N[code] ?? 'errors.generic', code);
}

/**
 * Subscribes to Firebase auth state. Implemented in Phase 1 because the root
 * layout needs it to decide between the auth stack and the tab stack, and
 * absolute rule 13 forbids calling Firebase directly from a screen.
 *
 * @returns an unsubscribe function — always call it on unmount.
 */
export function subscribeToAuthChanges(onChange: (user: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, onChange);
}

/**
 * Sends a phone-OTP to an Indian mobile number.
 *
 * @param phoneNumber - any user-entered form; non-digits are stripped and +91
 *   is prepended. Must be a valid 10-digit Indian mobile once normalised.
 * @returns the confirmation handle whose `.confirm(code)` completes sign-in.
 * @throws {AuthError} with an i18n key on an invalid number or a Firebase error.
 */
export async function sendOtp(phoneNumber: string): Promise<ConfirmationResult> {
  if (!validateIndianPhone(phoneNumber)) {
    throw new AuthError('auth.phoneInvalid');
  }

  try {
    return await signInWithPhoneNumber(auth, formatIndianPhone(phoneNumber));
  } catch (error) {
    console.error('sendOtp failed:', error);
    throw mapFirebaseAuthError(firebaseErrorCode(error));
  }
}

/**
 * Confirms an OTP against the handle returned by {@link sendOtp}.
 * @throws {AuthError} with an i18n key on a wrong or expired code.
 */
export async function verifyOtp(
  confirmation: ConfirmationResult,
  otp: string,
): Promise<UserCredential> {
  try {
    const credential = await confirmation.confirm(otp);
    if (credential === null) {
      throw new AuthError('errors.generic');
    }
    return credential;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    console.error('verifyOtp failed:', error);
    throw mapFirebaseAuthError(firebaseErrorCode(error));
  }
}

/** The raw Firebase credential, or `null` when signed out. */
export function getCurrentUser(): FirebaseUser | null {
  return auth.currentUser;
}

/**
 * Signs the current user out.
 * @phase Phase 2 — Auth & Onboarding (already usable)
 */
export async function signOutUser(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('signOutUser failed:', error);
    throw error;
  }
}

/**
 * Signs in anonymously for guest mode.
 * @phase Phase 2 — guest mode is a local flag; Firebase anonymous auth is unused.
 */
export function signInAsGuest(): Promise<FirebaseUser> {
  return Promise.reject(new Error('Not implemented — Phase 2'));
}

/**
 * Permanently deletes the signed-in user's Firestore profile and auth account.
 * Navigation and store cleanup are the caller's responsibility (absolute rule 14).
 */
export async function deleteAccount(): Promise<void> {
  const user = auth.currentUser;
  if (user === null) return;

  try {
    await deleteUserProfile(user.uid);
    await deleteUser(user);
  } catch (error) {
    console.error('deleteAccount failed:', error);
    if (error instanceof AuthError) throw error;
    // Firebase requires a fresh login to delete an account after ~5 minutes;
    // surface that as `errors.sessionExpired` rather than a generic failure.
    throw mapFirebaseAuthError(firebaseErrorCode(error));
  }
}
