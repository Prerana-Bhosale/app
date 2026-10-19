import { onAuthStateChanged, signInWithPhoneNumber, signOut } from '@react-native-firebase/auth';

import {
  AuthError,
  deleteAccount,
  mapFirebaseAuthError,
  sendOtp,
  signInAsGuest,
  signOutUser,
  subscribeToAuthChanges,
  verifyOtp,
} from '@/services/firebase/auth.service';

function silenceConsoleError(): jest.SpyInstance {
  return jest.spyOn(console, 'error').mockImplementation(() => undefined);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('subscribeToAuthChanges', () => {
  it('registers the callback with Firebase and returns the unsubscribe', () => {
    const unsubscribe = jest.fn();
    jest.mocked(onAuthStateChanged).mockReturnValueOnce(unsubscribe);

    const callback = jest.fn();
    const result = subscribeToAuthChanges(callback);

    expect(onAuthStateChanged).toHaveBeenCalledWith(expect.anything(), callback);
    expect(result).toBe(unsubscribe);
  });
});

describe('signOutUser', () => {
  it('delegates to Firebase signOut', async () => {
    jest.mocked(signOut).mockResolvedValueOnce(undefined);
    await expect(signOutUser()).resolves.toBeUndefined();
    expect(signOut).toHaveBeenCalled();
  });

  it('rethrows so the caller can surface the failure', async () => {
    const errorSpy = silenceConsoleError();
    jest.mocked(signOut).mockRejectedValueOnce(new Error('network'));

    await expect(signOutUser()).rejects.toThrow('network');
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

describe('mapFirebaseAuthError', () => {
  it.each([
    ['auth/invalid-phone-number', 'auth.phoneInvalid'],
    ['auth/too-many-requests', 'auth.tooManyRequests'],
    ['auth/invalid-verification-code', 'auth.otpInvalid'],
    ['auth/code-expired', 'auth.otpExpired'],
    ['auth/user-disabled', 'errors.sessionExpired'],
    ['auth/network-request-failed', 'errors.networkError'],
    ['auth/some-unknown-code', 'errors.generic'],
  ])('%s maps to i18n key %s', (code, expected) => {
    const error = mapFirebaseAuthError(code);
    expect(error).toBeInstanceOf(AuthError);
    expect(error.i18nKey).toBe(expected);
  });
});

describe('sendOtp', () => {
  it('normalises a 10-digit number to +91 E.164 before calling Firebase', async () => {
    jest.mocked(signInWithPhoneNumber).mockResolvedValueOnce({ confirm: jest.fn() } as never);

    await sendOtp('9876543210');

    expect(signInWithPhoneNumber).toHaveBeenCalledWith(expect.anything(), '+919876543210');
  });

  it('throws an AuthError with auth.phoneInvalid for a malformed number', async () => {
    await expect(sendOtp('12345')).rejects.toMatchObject({ i18nKey: 'auth.phoneInvalid' });
    expect(signInWithPhoneNumber).not.toHaveBeenCalled();
  });

  it('maps a Firebase error code to an AuthError i18n key', async () => {
    const errorSpy = silenceConsoleError();
    jest.mocked(signInWithPhoneNumber).mockRejectedValueOnce({ code: 'auth/too-many-requests' });

    await expect(sendOtp('9876543210')).rejects.toMatchObject({ i18nKey: 'auth.tooManyRequests' });

    errorSpy.mockRestore();
  });

  it('falls back to errors.generic when the thrown value carries no code', async () => {
    const errorSpy = silenceConsoleError();
    jest.mocked(signInWithPhoneNumber).mockRejectedValueOnce('offline');

    await expect(sendOtp('9876543210')).rejects.toMatchObject({ i18nKey: 'errors.generic' });

    errorSpy.mockRestore();
  });
});

describe('verifyOtp', () => {
  it('returns the credential on a successful confirm', async () => {
    const confirmation = { confirm: jest.fn().mockResolvedValueOnce({ user: { uid: 'u1' } }) };

    await expect(verifyOtp(confirmation as never, '123456')).resolves.toEqual({
      user: { uid: 'u1' },
    });
  });

  it('throws errors.generic when confirm resolves null', async () => {
    const errorSpy = silenceConsoleError();
    const confirmation = { confirm: jest.fn().mockResolvedValueOnce(null) };

    await expect(verifyOtp(confirmation as never, '123456')).rejects.toMatchObject({
      i18nKey: 'errors.generic',
    });

    errorSpy.mockRestore();
  });

  it('maps an invalid-code error to auth.otpInvalid', async () => {
    const errorSpy = silenceConsoleError();
    const confirmation = {
      confirm: jest.fn().mockRejectedValueOnce({ code: 'auth/invalid-verification-code' }),
    };

    await expect(verifyOtp(confirmation as never, '000000')).rejects.toMatchObject({
      i18nKey: 'auth.otpInvalid',
    });

    errorSpy.mockRestore();
  });
});

describe('deleteAccount', () => {
  it('resolves without error when there is no signed-in user', async () => {
    await expect(deleteAccount()).resolves.toBeUndefined();
  });
});

describe('signInAsGuest', () => {
  it('rejects until it is needed', async () => {
    await expect(signInAsGuest()).rejects.toThrow('Not implemented');
  });
});
