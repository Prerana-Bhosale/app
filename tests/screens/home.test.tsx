import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { ROUTES } from '@/constants/routes';
import { STORAGE_FLAG_ON, STORAGE_KEYS } from '@/constants/storage';
import { useAuthStore } from '@/stores/auth.store';
import { useSOSStore } from '@/stores/sos.store';
import { useUserStore } from '@/stores/user.store';
import HomeScreen from '@app/(tabs)/index';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('expo-audio', () => ({
  createAudioPlayer: () => ({
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    loop: false,
    volume: 0,
  }),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-sensors', () => ({
  Accelerometer: {
    setUpdateInterval: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('expo-battery', () => ({
  getBatteryLevelAsync: jest.fn(() => Promise.resolve(1)),
  addBatteryLevelListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock('expo-sms', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(false)),
  sendSMSAsync: jest.fn(),
}));

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.getState().reset();
    useSOSStore.getState().reset();
  });

  afterEach(() => {
    useSOSStore.getState().reset();
  });

  it('renders the SOS button and the quick actions', async () => {
    const { getByText, getByLabelText } = await render(<HomeScreen />);

    expect(getByLabelText('SOS Emergency Button')).toBeTruthy();
    expect(getByText('Live Location')).toBeTruthy();
    expect(getByText('Siren')).toBeTruthy();
    expect(getByText('Fake Call')).toBeTruthy();
  });

  it('does not show how many contacts are saved on the contacts card', async () => {
    useUserStore.setState({
      emergencyContacts: [
        {
          id: 'c1',
          name: 'Mom',
          phone: '9876543210',
          relationship: 'Mother',
          isPredefined: false,
          order: 0,
        },
        {
          id: 'c2',
          name: 'Dad',
          phone: '9876543211',
          relationship: 'Father',
          isPredefined: false,
          order: 1,
        },
      ],
    } as never);

    const { getByText, queryByText } = await render(<HomeScreen />);

    expect(getByText('Emergency Contacts')).toBeTruthy();
    expect(queryByText('2 saved')).toBeNull();
    expect(queryByText('2')).toBeNull();
    useUserStore.setState({ emergencyContacts: [] } as never);
  });

  it('flags the contacts card when no contact has been added', async () => {
    useUserStore.setState({ emergencyContacts: [] } as never);
    const { getByText } = await render(<HomeScreen />);
    expect(getByText('Add')).toBeTruthy();
  });

  it('triggers SOS after three quick taps on the SOS button', async () => {
    const { getByLabelText } = await render(<HomeScreen />);
    const button = getByLabelText('SOS Emergency Button');

    await fireEvent.press(button);
    await fireEvent.press(button);
    await fireEvent.press(button);

    expect(useSOSStore.getState().isActive).toBe(true);
  });

  it('shows failure alert with 112 helpline and retry options on dispatch error', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    useSOSStore.getState().setLastOutcome({ sent: 0, failed: 0, error: 'failed' });

    await render(<HomeScreen />);

    expect(alertSpy).toHaveBeenCalledWith(
      'SOS alert',
      'Failed to send emergency alert. Please call 112 immediately.',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Try again' }),
        expect.objectContaining({ text: 'Call 112 (Emergency Helpline)' }),
      ]),
    );
  });

  it('locks write-requiring cards for a guest and prompts to sign in instead of navigating', async () => {
    useAuthStore.getState().setGuest(true);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByText } = await render(<HomeScreen />);
    await fireEvent.press(getByText('Emergency Contacts'));

    expect(mockPush).not.toHaveBeenCalledWith(ROUTES.EMERGENCY_CONTACTS);
    expect(alertSpy).toHaveBeenCalledWith(
      'Sign in required',
      expect.any(String),
      expect.any(Array),
    );
  });

  it('sends a signed-in-guest to Welcome when they choose to sign in from the prompt', async () => {
    useAuthStore.getState().setGuest(true);
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const signInButton = buttons?.find((button) => button.text === 'Sign In Now');
      signInButton?.onPress?.();
    });

    const { getByText } = await render(<HomeScreen />);
    await fireEvent.press(getByText('Live Location'));

    expect(useAuthStore.getState().isGuestSigningIn).toBe(true);
    expect(mockPush).toHaveBeenCalledWith(ROUTES.WELCOME);
  });

  it('does not lock a card that does not need a real sign-in', async () => {
    useAuthStore.getState().setGuest(true);

    const { getByText } = await render(<HomeScreen />);
    await fireEvent.press(getByText('Nearby Help'));

    expect(mockPush).toHaveBeenCalledWith(ROUTES.NEARBY_HELP);
  });

  it('navigates straight through for a signed-in user', async () => {
    const { getByText } = await render(<HomeScreen />);
    await fireEvent.press(getByText('Emergency Contacts'));

    expect(mockPush).toHaveBeenCalledWith(ROUTES.EMERGENCY_CONTACTS);
  });

  describe('iOS one-tap hint banner', () => {
    afterEach(() => {
      jest.mocked(AsyncStorage.getItem).mockImplementation(() => Promise.resolve(null));
    });

    it('shows the hint on iOS until dismissed, then remembers the dismissal', async () => {
      jest
        .mocked(AsyncStorage.getItem)
        .mockImplementation((key: string) =>
          Promise.resolve(key === STORAGE_KEYS.IOS_HINT_DISMISSED ? null : null),
        );
      const { getByLabelText, queryByText } = await render(<HomeScreen />);
      await act(() => Promise.resolve());

      expect(queryByText(/One tap is the minimum Apple allows/)).toBeTruthy();

      await fireEvent.press(getByLabelText('Dismiss iPhone tip'));

      expect(queryByText(/One tap is the minimum Apple allows/)).toBeNull();
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.IOS_HINT_DISMISSED,
        STORAGE_FLAG_ON,
      );
    });

    it('stays hidden once already dismissed', async () => {
      jest
        .mocked(AsyncStorage.getItem)
        .mockImplementation((key: string) =>
          Promise.resolve(key === STORAGE_KEYS.IOS_HINT_DISMISSED ? STORAGE_FLAG_ON : null),
        );
      const { queryByText } = await render(<HomeScreen />);
      await act(() => Promise.resolve());

      expect(queryByText(/One tap is the minimum Apple allows/)).toBeNull();
    });
  });
});
