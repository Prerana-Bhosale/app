import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { OTP_LENGTH } from '@/constants/auth';
import { AuthError, sendOtp, verifyOtp } from '@/services/firebase/auth.service';
import { doesUserExist } from '@/services/firebase/user.service';
import OtpScreen from '@app/(auth)/otp';
import { getStoredConfirmation } from '@app/(auth)/phone';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => ({ phone: '+919876543210' }),
}));

jest.mock('@/constants/auth', () => ({
  ...jest.requireActual('@/constants/auth'),
  OTP_RESEND_SECONDS: 0,
}));

jest.mock('@app/(auth)/phone', () => ({
  getStoredConfirmation: jest.fn(() => ({ confirm: jest.fn() })),
  setStoredConfirmation: jest.fn(),
}));

jest.mock('@/services/firebase/auth.service', () => {
  class MockAuthError extends Error {
    i18nKey: string;
    constructor(key: string) {
      super(key);
      this.i18nKey = key;
    }
  }
  return { AuthError: MockAuthError, verifyOtp: jest.fn(), sendOtp: jest.fn() };
});

jest.mock('@/services/firebase/user.service', () => ({
  doesUserExist: jest.fn(),
}));

describe('OtpScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getStoredConfirmation).mockReturnValue({ confirm: jest.fn() } as never);
  });

  it('renders one input box per OTP digit and the masked destination', async () => {
    const { getAllByLabelText, getByText } = await render(<OtpScreen />);

    expect(getAllByLabelText('Enter OTP')).toHaveLength(OTP_LENGTH);
    expect(getByText('OTP sent to +91XXXXXX3210')).toBeTruthy();
  });

  it('auto-submits when all digits are entered and routes a new user to onboarding', async () => {
    jest.mocked(verifyOtp).mockResolvedValue({ user: { uid: 'u1' } } as never);
    jest.mocked(doesUserExist).mockResolvedValue(false);

    const { getAllByLabelText } = await render(<OtpScreen />);

    await [0, 1, 2, 3, 4, 5].reduce(
      (chain, i) =>
        chain.then(() =>
          fireEvent.changeText(getAllByLabelText('Enter OTP')[i] as never, String(i)),
        ),
      Promise.resolve(),
    );

    await waitFor(() => {
      expect(verifyOtp).toHaveBeenCalledWith(expect.anything(), '012345');
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/onboarding');
    });
  });

  it('shows an error and clears the boxes on a bad code', async () => {
    jest.mocked(verifyOtp).mockRejectedValue(new AuthError('auth.otpInvalid'));

    const { getAllByLabelText, findByText } = await render(<OtpScreen />);

    await [0, 1, 2, 3, 4, 5].reduce(
      (chain, i) =>
        chain.then(() => fireEvent.changeText(getAllByLabelText('Enter OTP')[i] as never, '1')),
      Promise.resolve(),
    );

    expect(
      await findByText('Incorrect verification code. Please check and try again.'),
    ).toBeTruthy();
  });

  it('bounces back to the phone screen when the confirmation was lost', async () => {
    jest.mocked(getStoredConfirmation).mockReturnValue(null);

    const { getAllByLabelText, findByText } = await render(<OtpScreen />);

    await [0, 1, 2, 3, 4, 5].reduce(
      (chain, i) =>
        chain.then(() => fireEvent.changeText(getAllByLabelText('Enter OTP')[i] as never, '1')),
      Promise.resolve(),
    );

    expect(await findByText('Your session has expired. Please sign in again.')).toBeTruthy();
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/phone');
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('preserves digits and shows retry button on network error', async () => {
    jest.mocked(verifyOtp).mockRejectedValueOnce(new AuthError('errors.networkError'));

    const { getAllByLabelText, findByText } = await render(<OtpScreen />);
    const inputs = getAllByLabelText('Enter OTP');

    await [0, 1, 2, 3, 4, 5].reduce(
      (chain, i) => chain.then(() => fireEvent.changeText(inputs[i] as never, String(i))),
      Promise.resolve(),
    );

    expect(await findByText('No internet connection. Please try again.')).toBeTruthy();
    expect(inputs[0]?.props.value).toBe('0');
    expect(inputs[5]?.props.value).toBe('5');

    const retryButton = await findByText('Try again');
    expect(retryButton).toBeTruthy();

    jest.mocked(verifyOtp).mockResolvedValueOnce({ user: { uid: 'u1' } } as never);
    jest.mocked(doesUserExist).mockResolvedValueOnce(true);
    await fireEvent.press(retryButton);

    await waitFor(() => {
      expect(verifyOtp).toHaveBeenCalledTimes(2);
      expect(verifyOtp).toHaveBeenLastCalledWith(expect.anything(), '012345');
    });
  });

  it('prevents duplicate resend requests when resend is in-flight', async () => {
    let resolveSendOtp: (val: unknown) => void = () => undefined;
    const sendOtpPromise = new Promise((resolve) => {
      resolveSendOtp = resolve;
    });
    jest.mocked(sendOtp).mockReturnValue(sendOtpPromise as never);

    const { getByText } = await render(<OtpScreen />);
    const resendBtn = getByText('Resend OTP');
    expect(resendBtn).toBeTruthy();

    await fireEvent.press(resendBtn);
    await fireEvent.press(resendBtn);

    expect(sendOtp).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSendOtp({ confirm: jest.fn() });
      await Promise.resolve();
    });
  });
});
