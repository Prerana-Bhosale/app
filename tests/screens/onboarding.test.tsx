import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Contacts from 'expo-contacts';
import * as Location from 'expo-location';
import React from 'react';
import { Alert, AppState, type AppStateStatus, Linking } from 'react-native';

import { ROUTES } from '@/constants/routes';
import { STORAGE_FLAG_ON, STORAGE_KEYS } from '@/constants/storage';
import OnboardingScreen from '@app/(auth)/onboarding';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
}));

jest.mock('@/services/firebase/auth.service', () => ({
  getCurrentUser: jest.fn(() => ({ uid: 'u1', phoneNumber: '+919876543210' })),
}));

jest.mock('@/services/firebase/user.service', () => {
  const actual = jest.requireActual<typeof import('@/services/firebase/user.service')>(
    '@/services/firebase/user.service',
  );
  return {
    ...actual,
    createUserProfile: jest.fn(() =>
      Promise.resolve({
        userId: 'u1',
        name: 'Priya Sharma',
        city: 'Mumbai',
        language: 'en',
        phone: '+919876543210',
        profilePhotoUrl: '',
        isGuest: false,
        createdAt: {},
        updatedAt: {},
      }),
    ),
    addEmergencyContact: jest.fn((_uid: string, contact: unknown) =>
      Promise.resolve({
        id: 'c1',
        ...(contact as Record<string, unknown>),
      }),
    ),
    deleteEmergencyContact: jest.fn(() => Promise.resolve()),
  };
});

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts on the language step with all three options', async () => {
    const { getByText, getAllByText } = await render(<OnboardingScreen />);

    expect(getByText('Choose Your Language')).toBeTruthy();
    // 'English' appears twice for the English option — once as the native
    // name, once as the English name shown alongside every option.
    expect(getAllByText('English')).toHaveLength(2);
    expect(getByText('हिन्दी')).toBeTruthy();
    expect(getByText('Hindi')).toBeTruthy();
    expect(getByText('मराठी')).toBeTruthy();
    expect(getByText('Marathi')).toBeTruthy();
  });

  it('advances to the permissions step', async () => {
    const { getByText } = await render(<OnboardingScreen />);

    await fireEvent.press(getByText('Next'));

    await waitFor(() => {
      expect(getByText('Allow Permissions')).toBeTruthy();
    });
  });

  it('blocks leaving the permissions step until the required ones are granted and provides open settings action', async () => {
    const openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    let capturedButtons: { text?: string; onPress?: () => void }[] | undefined;
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      capturedButtons = buttons as never;
    });

    const { getByText } = await render(<OnboardingScreen />);
    await fireEvent.press(getByText('Next'));
    await waitFor(() => getByText('Allow Permissions'));
    await fireEvent.press(getByText('Next'));

    expect(alertSpy).toHaveBeenCalledWith(
      'This permission is required for Surakshak to protect you',
      'Please enable the required permissions in your device settings to continue.',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ text: 'Open Settings' }),
      ]),
    );

    const openSettingsBtn = capturedButtons?.find((b) => b.text === 'Open Settings');
    openSettingsBtn?.onPress?.();
    expect(openSettingsSpy).toHaveBeenCalledTimes(1);

    alertSpy.mockRestore();
    openSettingsSpy.mockRestore();
  });

  it('refreshes granted permissions when app becomes active from settings', async () => {
    let appStateListener: ((state: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    });

    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({
      granted: true,
      status: 'granted' as never,
      expires: 'never',
      canAskAgain: true,
    });
    jest.mocked(Contacts.getPermissionsAsync).mockResolvedValue({
      granted: true,
      status: 'granted' as never,
      expires: 'never',
      canAskAgain: true,
    });

    const { getByText } = await render(<OnboardingScreen />);
    await fireEvent.press(getByText('Next'));
    await waitFor(() => getByText('Allow Permissions'));

    await act(async () => {
      appStateListener?.('active');
      await Promise.resolve();
    });

    await fireEvent.press(getByText('Next'));
    await waitFor(() => {
      expect(getByText('Your Profile')).toBeTruthy();
    });
  });

  it('requires at least one emergency contact before completing onboarding', async () => {
    jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({
      granted: true,
      status: 'granted' as never,
      expires: 'never',
      canAskAgain: true,
    });
    jest.mocked(Contacts.requestPermissionsAsync).mockResolvedValue({
      granted: true,
      status: 'granted' as never,
      expires: 'never',
      canAskAgain: true,
    });

    const { getByText, getAllByText, getByPlaceholderText } = await render(<OnboardingScreen />);

    // Step 1: Language -> Next
    await fireEvent.press(getByText('Next'));
    await waitFor(() => getByText('Allow Permissions'));

    // Step 2: Grant permissions -> Next
    const allowButtons = getAllByText('Allow');
    for (const btn of allowButtons) {
      await act(async () => {
        await fireEvent.press(btn);
      });
    }
    await act(async () => {
      await fireEvent.press(getByText('Next'));
    });

    // Step 3: Fill Profile -> Next
    await waitFor(() => getByText('Your Profile'));
    const nameInput = getByPlaceholderText('Your name');
    const cityInput = getByPlaceholderText('Your city');
    await fireEvent.changeText(nameInput, 'Priya Sharma');
    await fireEvent.changeText(cityInput, 'Mumbai');

    await fireEvent.press(getByText('Next'));

    // Step 4: Emergency Contacts
    await waitFor(() => {
      expect(getByText('Emergency Contacts')).toBeTruthy();
    });
    expect(getByText('No emergency contacts added yet')).toBeTruthy();

    // The Get Started button is initially disabled because contacts.length === 0
    const getStartedBtn = getByText('Get Started');
    expect(getStartedBtn).toBeTruthy();

    // Open add contact modal
    await fireEvent.press(getByText('Add Contact'));
    await waitFor(() => getByText('Save'));

    // Fill contact form
    const contactName = getByPlaceholderText('Contact name');
    const contactPhone = getByPlaceholderText('10-digit number');
    const contactRelation = getByPlaceholderText('e.g. Mother, Friend, Sister');

    await fireEvent.changeText(contactName, 'Mom');
    await fireEvent.changeText(contactPhone, '9876543211');
    await fireEvent.changeText(contactRelation, 'Mother');

    await act(async () => {
      await fireEvent.press(getByText('Save'));
    });

    // Contact is now visible in the list
    await waitFor(() => {
      expect(getByText('Mom')).toBeTruthy();
    });

    // Now complete onboarding
    await act(async () => {
      await fireEvent.press(getByText('Get Started'));
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEYS.ONBOARDING_COMPLETE,
      STORAGE_FLAG_ON,
    );
    expect(mockReplace).toHaveBeenCalledWith(ROUTES.HOME);
  });
});
