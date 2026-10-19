import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { AuthError, sendOtp } from '@/services/firebase/auth.service';
import PhoneScreen from '@app/(auth)/phone';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/services/firebase/auth.service', () => {
  class MockAuthError extends Error {
    i18nKey: string;
    constructor(key: string) {
      super(key);
      this.i18nKey = key;
    }
  }
  return { AuthError: MockAuthError, sendOtp: jest.fn() };
});

describe('PhoneScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the fixed +91 prefix and a phone input', async () => {
    const { getByText, getByPlaceholderText } = await render(<PhoneScreen />);

    expect(getByText('🇮🇳  +91')).toBeTruthy();
    expect(getByPlaceholderText('10-digit mobile number')).toBeTruthy();
  });

  it('requests an OTP and navigates on a valid number', async () => {
    jest.mocked(sendOtp).mockResolvedValueOnce({ confirm: jest.fn() } as never);

    const { getByPlaceholderText, getByText } = await render(<PhoneScreen />);

    await fireEvent.changeText(getByPlaceholderText('10-digit mobile number'), '9876543210');

    await waitFor(() => {
      void fireEvent.press(getByText('Send OTP'));
      expect(sendOtp).toHaveBeenCalledWith('9876543210');
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(auth)/otp',
        params: { phone: '+919876543210' },
      });
    });
  });

  it('surfaces a mapped auth error under the field', async () => {
    jest.mocked(sendOtp).mockRejectedValue(new AuthError('auth.tooManyRequests'));

    const { getByPlaceholderText, getByText, findByText } = await render(<PhoneScreen />);

    await fireEvent.changeText(getByPlaceholderText('10-digit mobile number'), '9876543210');

    await waitFor(() => {
      void fireEvent.press(getByText('Send OTP'));
      expect(sendOtp).toHaveBeenCalled();
    });

    expect(await findByText('Too many attempts. Please wait before trying again.')).toBeTruthy();
  });

  it('keeps the Send OTP button enabled after a network failure, allowing immediate retry', async () => {
    jest.mocked(sendOtp).mockRejectedValueOnce(new AuthError('errors.networkError'));

    const { getByPlaceholderText, getByText, findByText } = await render(<PhoneScreen />);
    const input = getByPlaceholderText('10-digit mobile number');
    const sendButton = getByText('Send OTP');

    await fireEvent.changeText(input, '9876543210');

    await fireEvent.press(sendButton);
    await waitFor(() => {
      expect(sendOtp).toHaveBeenCalledTimes(1);
    });

    expect(await findByText('No internet connection. Please try again.')).toBeTruthy();

    // Immediate retry without modifying input
    jest.mocked(sendOtp).mockResolvedValueOnce({ confirm: jest.fn() } as never);
    await fireEvent.press(sendButton);

    await waitFor(() => {
      expect(sendOtp).toHaveBeenCalledTimes(2);
    });
  });
});
