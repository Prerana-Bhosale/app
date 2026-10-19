import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';

import { APP_CONFIG } from '@/constants/config';
import { useSafeJourneyMonitor } from '@/hooks/useSafeJourneyMonitor';
import * as journeyService from '@/services/firebase/safe-journey.service';
import * as notificationService from '@/services/notification.service';
import * as smsService from '@/services/sms.service';
import { useLocationStore } from '@/stores/location.store';
import { useUserStore } from '@/stores/user.store';

jest.mock('@/services/firebase/safe-journey.service', () => ({
  getActiveJourneySession: jest.fn(() => Promise.resolve(null)),
  markAlertSent: jest.fn(() => Promise.resolve()),
  cancelSafeJourney: jest.fn(() => Promise.resolve()),
  markSafeJourneyArrived: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/services/notification.service', () => ({
  scheduleLocalNotification: jest.fn(() => Promise.resolve('id')),
  cancelLocalNotification: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/services/sms.service', () => ({
  sendSafeJourneyAlert: jest.fn(() => Promise.resolve({ sent: ['+919876543210'], failed: [] })),
  recordSMSAlert: jest.fn(() => Promise.resolve({ id: 'r1' })),
}));

jest.mock('@/services/location.service', () => ({
  getLocationWithTimeout: jest.fn(() =>
    Promise.resolve({ latitude: 1, longitude: 2, timestamp: 0 }),
  ),
  buildLocationUrl: jest.fn((lat: number, lng: number) => `https://maps/${lat},${lng}`),
}));

jest.mock('@/services/analytics.service', () => ({ trackSafeJourneyAlertSent: jest.fn() }));

const MINUTE = 60_000;

function session(expectedArrival: Date): Record<string, unknown> {
  return {
    id: 'j1',
    userId: 'u1',
    destinationName: 'Andheri',
    destinationLatitude: 19,
    destinationLongitude: 72,
    etaMinutes: 30,
    sharedWithUserIds: ['c1'],
    startedAt: { toDate: () => new Date() },
    expectedArrivalAt: { toDate: () => expectedArrival },
    status: 'active',
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

describe('useSafeJourneyMonitor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useLocationStore.getState().reset();
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
      ],
    } as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does nothing without a signed-in user', async () => {
    await renderHook(() => useSafeJourneyMonitor(null));
    await flush();
    expect(journeyService.getActiveJourneySession).not.toHaveBeenCalled();
  });

  it('marks the journey active and schedules the warning and due reminders', async () => {
    jest
      .mocked(journeyService.getActiveJourneySession)
      .mockResolvedValue(session(new Date(Date.now() + 30 * MINUTE)) as never);

    await renderHook(() => useSafeJourneyMonitor('u1'));
    await flush();

    expect(useLocationStore.getState().isSafeJourneyActive).toBe(true);
    expect(notificationService.scheduleLocalNotification).toHaveBeenCalledTimes(2);
    expect(smsService.sendSafeJourneyAlert).not.toHaveBeenCalled();
  });

  it('sends the overdue alert on its own once the deadline passes', async () => {
    const deadline = new Date(Date.now() + 2 * MINUTE);
    jest
      .mocked(journeyService.getActiveJourneySession)
      .mockResolvedValue(session(deadline) as never);

    await renderHook(() => useSafeJourneyMonitor('u1'));
    await flush();
    expect(smsService.sendSafeJourneyAlert).not.toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2 * MINUTE + 1000);
    });

    expect(journeyService.markAlertSent).toHaveBeenCalledWith('j1');
    expect(smsService.sendSafeJourneyAlert).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'c1' })],
      'https://maps/1,2',
      expect.any(String),
      'Andheri',
      expect.any(String),
      expect.any(String),
    );
    expect(useLocationStore.getState().isSafeJourneyActive).toBe(false);
  });

  it('quietly closes a journey that went stale while the app was closed', async () => {
    const longAgo = new Date(Date.now() - (APP_CONFIG.SAFE_JOURNEY_STALE_HOURS + 1) * 60 * MINUTE);
    jest
      .mocked(journeyService.getActiveJourneySession)
      .mockResolvedValue(session(longAgo) as never);

    await renderHook(() => useSafeJourneyMonitor('u1'));
    await flush();

    expect(journeyService.cancelSafeJourney).toHaveBeenCalledWith('j1');
    expect(smsService.sendSafeJourneyAlert).not.toHaveBeenCalled();
  });

  it('re-reads the journey when a screen bumps the revision', async () => {
    await renderHook(() => useSafeJourneyMonitor('u1'));
    await flush();
    expect(journeyService.getActiveJourneySession).toHaveBeenCalledTimes(1);

    await act(() => {
      useLocationStore.getState().bumpSafeJourneyRevision();
    });
    await flush();

    expect(journeyService.getActiveJourneySession).toHaveBeenCalledTimes(2);
    expect(notificationService.cancelLocalNotification).toHaveBeenCalled();
  });

  it('does not alert if the session was marked arrived offline', async () => {
    const deadline = new Date(Date.now() - 1000);
    jest
      .mocked(journeyService.getActiveJourneySession)
      .mockResolvedValue(session(deadline) as never);
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify(['j1']));

    await renderHook(() => useSafeJourneyMonitor('u1'));
    await flush();

    expect(smsService.sendSafeJourneyAlert).not.toHaveBeenCalled();
    expect(useLocationStore.getState().isSafeJourneyActive).toBe(false);
  });
});
