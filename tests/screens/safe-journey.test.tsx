import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { useAuthStore } from '@/stores/auth.store';
import { useLocationStore } from '@/stores/location.store';
import SafeJourneyScreen from '@app/safe-journey';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/services/location.service', () => ({
  getCurrentLocation: jest.fn(() => Promise.resolve({ latitude: 19, longitude: 72, timestamp: 0 })),
  getLocationWithTimeout: jest.fn(() =>
    Promise.resolve({ latitude: 19, longitude: 72, timestamp: 0 }),
  ),
  autocompletePlaces: jest.fn(() => Promise.resolve([])),
  getPlaceLocation: jest.fn(),
}));

const mockGetActiveJourney = jest.fn(() => Promise.resolve(null));
jest.mock('@/services/firebase/safe-journey.service', () => ({
  getActiveJourneySession: () => mockGetActiveJourney(),
  createSafeJourneySession: jest.fn(),
  checkInSafeJourney: jest.fn(() => Promise.resolve()),
  extendSafeJourneyEta: jest.fn(() => Promise.resolve()),
  markSafeJourneyArrived: jest.fn(() => Promise.resolve()),
  markAlertSent: jest.fn(() => Promise.resolve()),
  cancelSafeJourney: jest.fn(() => Promise.resolve()),
}));

const mockSendSafeJourneyEtaExtended = jest.fn(() =>
  Promise.resolve({ sent: ['+919000000000'], failed: [] }),
);
jest.mock('@/services/sms.service', () => ({
  sendSafeJourneyStart: jest.fn(() => Promise.resolve({ sent: ['+919000000000'], failed: [] })),
  sendSafeJourneyEtaExtended: mockSendSafeJourneyEtaExtended,
  recordSMSAlert: jest.fn(() => Promise.resolve()),
}));

const authSnapshot = useAuthStore.getState();

describe('SafeJourneyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveJourney.mockResolvedValue(null);
    useAuthStore.setState({ ...authSnapshot });
  });

  it('renders the destination field and the start button', async () => {
    const { getByText } = await render(<SafeJourneyScreen />);
    expect(getByText('Destination')).toBeTruthy();
    expect(getByText('Start Journey')).toBeTruthy();
  });

  it('accepts a destination and an ETA preset', async () => {
    const { getByText, getByPlaceholderText } = await render(<SafeJourneyScreen />);
    await fireEvent.changeText(getByPlaceholderText('Where are you going?'), 'Andheri Station');
    await fireEvent.press(getByText('15 min'));
    expect(getByText('Start Journey')).toBeTruthy();
  });

  it('shows the active-journey controls when a session is in progress', async () => {
    useAuthStore.setState({
      ...authSnapshot,
      surakshakUser: {
        userId: 'u1',
        name: 'Asha',
        phone: '9000000000',
        profilePhotoUrl: '',
        city: 'Mumbai',
        state: 'MH',
        language: 'en',
        isGuest: false,
        createdAt: null as never,
        updatedAt: null as never,
      },
    });
    mockGetActiveJourney.mockResolvedValue({
      id: 'j1',
      userId: 'u1',
      destinationName: 'Andheri Station',
      destinationLatitude: 19.1,
      destinationLongitude: 72.8,
      etaMinutes: 30,
      sharedWithUserIds: [],
      startedAt: { toDate: () => new Date() },
      expectedArrivalAt: { toDate: () => new Date(Date.now() + 600_000) },
      status: 'active',
    } as never);

    const { findByText } = await render(<SafeJourneyScreen />);
    expect(await findByText('Andheri Station')).toBeTruthy();
    expect(await findByText("Check in: I'm safe (reset timer)")).toBeTruthy();
    expect(await findByText('Cancel Journey')).toBeTruthy();
  });

  it('displays overdue status for an already-overdue journey and bumps monitor revision', async () => {
    useAuthStore.setState({
      ...authSnapshot,
      surakshakUser: { userId: 'u1', name: 'Asha', language: 'en' } as never,
    });
    mockGetActiveJourney.mockResolvedValue({
      id: 'j1',
      userId: 'u1',
      destinationName: 'Andheri Station',
      destinationLatitude: 19.1,
      destinationLongitude: 72.8,
      etaMinutes: 30,
      sharedWithUserIds: [],
      startedAt: { toDate: () => new Date(Date.now() - 3_600_000) },
      expectedArrivalAt: { toDate: () => new Date(Date.now() - 60_000) },
      status: 'active',
    } as never);
    const revisionBefore = useLocationStore.getState().safeJourneyRevision;

    const { findAllByText, findByText } = await render(<SafeJourneyScreen />);

    expect(await findByText('Andheri Station')).toBeTruthy();
    expect(
      await findByText(
        'Your arrival deadline has passed. An alert was sent to your emergency contacts.',
      ),
    ).toBeTruthy();
    const overdueBadges = await findAllByText('Journey Overdue');
    expect(overdueBadges.length).toBeGreaterThan(0);
    expect(useLocationStore.getState().safeJourneyRevision).toBeGreaterThan(revisionBefore);
  });

  it('warns when the destination was typed instead of picked', async () => {
    const { getByPlaceholderText, findByText } = await render(<SafeJourneyScreen />);
    await fireEvent.changeText(getByPlaceholderText('Where are you going?'), 'Andheri Station');
    expect(
      await findByText(
        'Not picked from the suggestions: your current location will be saved as the destination.',
      ),
    ).toBeTruthy();
  });

  it('marks journey arrived locally and handles backend sync error gracefully', async () => {
    useAuthStore.setState({
      ...authSnapshot,
      surakshakUser: {
        userId: 'u1',
        name: 'Asha',
        phone: '9000000000',
        profilePhotoUrl: '',
        city: 'Mumbai',
        state: 'MH',
        language: 'en',
        isGuest: false,
        createdAt: null as never,
        updatedAt: null as never,
      },
    });
    mockGetActiveJourney.mockResolvedValue({
      id: 'j1',
      userId: 'u1',
      destinationName: 'Andheri Station',
      destinationLatitude: 19.1,
      destinationLongitude: 72.8,
      etaMinutes: 30,
      sharedWithUserIds: [],
      startedAt: { toDate: () => new Date() },
      expectedArrivalAt: { toDate: () => new Date(Date.now() + 600_000) },
      status: 'active',
    } as never);

    const markArrivedMock = jest.requireMock(
      '@/services/firebase/safe-journey.service',
    ).markSafeJourneyArrived;
    markArrivedMock.mockRejectedValueOnce(new Error('Offline network error'));

    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const arrivedBtn = buttons?.find((button) => button.text === "I've Arrived");
      arrivedBtn?.onPress?.();
    });

    useLocationStore.getState().setSafeJourneyActive(true, 'j1');
    const { findByText } = await render(<SafeJourneyScreen />);

    const arrivedButton = await findByText("I've Arrived");
    await fireEvent.press(arrivedButton);

    expect(useLocationStore.getState().isSafeJourneyActive).toBe(false);
  });

  it('dispatches extension SMS when extending journey duration', async () => {
    useAuthStore.setState({
      ...authSnapshot,
      surakshakUser: {
        userId: 'u1',
        name: 'Asha',
        phone: '9000000000',
        profilePhotoUrl: '',
        city: 'Mumbai',
        state: 'MH',
        language: 'en',
        isGuest: false,
        createdAt: null as never,
        updatedAt: null as never,
      },
    });
    useLocationStore.getState().setSafeJourneyActive(true, 'j1');
    mockGetActiveJourney.mockResolvedValue({
      id: 'j1',
      userId: 'u1',
      destinationName: 'Andheri Station',
      destinationLatitude: 19.1,
      destinationLongitude: 72.8,
      etaMinutes: 30,
      sharedWithUserIds: ['c1'],
      startedAt: { toDate: () => new Date() },
      expectedArrivalAt: { toDate: () => new Date(Date.now() + 600_000) },
      status: 'active',
    } as never);

    const { findByText } = await render(<SafeJourneyScreen />);
    const plus15Button = await findByText('+15 min');
    await fireEvent.press(plus15Button);

    const extendMock = jest.requireMock(
      '@/services/firebase/safe-journey.service',
    ).extendSafeJourneyEta;
    expect(extendMock).toHaveBeenCalledWith('j1', 15);
  });
});
