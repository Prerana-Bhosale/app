import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { STORAGE_KEYS } from '@/constants/storage';
import { registerLiveLocationTask, useLiveLocation } from '@/hooks/useLiveLocation';
import {
  createLiveLocationSession,
  extendLiveLocationSession,
  getActiveLiveSession,
  stopLiveLocationSession,
} from '@/services/firebase/live-location.service';
import { getCurrentLocation } from '@/services/location.service';
import { sendLiveLocationShare } from '@/services/sms.service';
import { useAuthStore } from '@/stores/auth.store';
import { useLocationStore } from '@/stores/location.store';

jest.mock('@/services/firebase/live-location.service', () => ({
  createLiveLocationSession: jest.fn(() => Promise.resolve('session-1')),
  extendLiveLocationSession: jest.fn(() => Promise.resolve()),
  stopLiveLocationSession: jest.fn(() => Promise.resolve()),
  updateLiveLocation: jest.fn(() => Promise.resolve()),
  getActiveLiveSession: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('@/services/location.service', () => ({
  getCurrentLocation: jest.fn(() =>
    Promise.resolve({ latitude: 19.076, longitude: 72.8777, timestamp: 1 }),
  ),
}));

jest.mock('@/services/sms.service', () => ({
  sendLiveLocationShare: jest.fn(() => Promise.resolve({ sent: ['+919000000000'], failed: [] })),
  recordSMSAlert: jest.fn(() => Promise.resolve()),
}));

const authState = useAuthStore.getState();

describe('useLiveLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useLocationStore.getState().reset();
    useAuthStore.setState({
      ...authState,
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
  });

  it('startSharing creates a session with the selected contacts and duration', async () => {
    const { result } = await renderHook(() => useLiveLocation());

    await act(async () => {
      await result.current.startSharing(['c1', 'c2'], 4);
    });

    expect(createLiveLocationSession).toHaveBeenCalledWith('u1', ['c1', 'c2'], 4, 19.076, 72.8777);
    expect(getCurrentLocation).toHaveBeenCalled();
    expect(sendLiveLocationShare).toHaveBeenCalled();
    expect(useLocationStore.getState().isLiveLocationActive).toBe(true);
    expect(useLocationStore.getState().liveLocationSessionId).toBe('session-1');
  });

  it('stopSharing ends the session and clears the store', async () => {
    useLocationStore.getState().setLiveLocationActive(true, 'session-1');
    const { result } = await renderHook(() => useLiveLocation());

    await act(async () => {
      await result.current.stopSharing();
    });

    expect(stopLiveLocationSession).toHaveBeenCalledWith('session-1');
    expect(useLocationStore.getState().isLiveLocationActive).toBe(false);
    expect(useLocationStore.getState().liveLocationSessionId).toBeNull();
  });

  it('extendTime extends the active session', async () => {
    useLocationStore.getState().setLiveLocationActive(true, 'session-1');
    jest
      .mocked(getActiveLiveSession)
      .mockResolvedValueOnce({ expiresAt: { toDate: () => new Date() } } as never);
    const { result } = await renderHook(() => useLiveLocation());

    await act(async () => {
      await result.current.extendTime(1);
    });

    expect(extendLiveLocationSession).toHaveBeenCalledWith('session-1', 1);
  });

  it('registerLiveLocationTask terminates background updates when session is expired', async () => {
    registerLiveLocationTask();
    const taskCallback = jest.mocked(TaskManager.defineTask).mock.calls[0]?.[1] as
      ((body: { data?: unknown; error?: unknown }) => Promise<void>) | undefined;
    expect(taskCallback).toBeDefined();

    jest.mocked(AsyncStorage.getItem).mockImplementation((key: string) => {
      if (key === STORAGE_KEYS.LIVE_LOCATION_EXPIRES_AT) {
        return Promise.resolve(String(Date.now() - 5000));
      }
      if (key === STORAGE_KEYS.LIVE_LOCATION_SESSION_ID) {
        return Promise.resolve('session-1');
      }
      return Promise.resolve(null);
    });

    await taskCallback!({ data: { locations: [{ coords: { latitude: 19, longitude: 72 } }] } });

    expect(stopLiveLocationSession).toHaveBeenCalledWith('session-1');
    expect(Location.stopLocationUpdatesAsync).toHaveBeenCalled();
    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
      STORAGE_KEYS.LIVE_LOCATION_SESSION_ID,
      STORAGE_KEYS.LIVE_LOCATION_EXPIRES_AT,
    ]);
  });
});
