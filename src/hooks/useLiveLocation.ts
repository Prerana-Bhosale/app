import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useCallback, useEffect, useState } from 'react';

import { captureException } from '@/config/sentry';
import { COLORS } from '@/constants/colors';
import { APP_CONFIG } from '@/constants/config';
import { STORAGE_KEYS } from '@/constants/storage';
import i18n from '@/i18n';
import {
  trackLiveLocationExtended,
  trackLiveLocationStarted,
  trackLiveLocationStopped,
} from '@/services/analytics.service';
import {
  createLiveLocationSession,
  extendLiveLocationSession,
  getActiveLiveSession,
  stopLiveLocationSession,
  updateLiveLocation,
} from '@/services/firebase/live-location.service';
import { getCurrentLocation } from '@/services/location.service';
import { recordSMSAlert, sendLiveLocationShare } from '@/services/sms.service';
import { useAuthStore } from '@/stores/auth.store';
import { useLocationStore } from '@/stores/location.store';
import { useUserStore } from '@/stores/user.store';
import { formatClockTime } from '@/utils/date.utils';
import { getLocationUrl } from '@/utils/location.utils';
import { requestBackgroundLocationPermission } from '@/utils/permissions.utils';

const BACKGROUND_LOCATION_TASK = 'surakshak-live-location';
const MS_PER_HOUR = 60 * 60 * 1000;

interface LocationTaskData {
  locations: Location.LocationObject[];
}

/**
 * Defines the background location task. Must be called once at module load in
 * the root layout — `defineTask` has to run before the JS engine finishes the
 * first tick or the OS cannot hand a relaunch back to it.
 */
export function registerLiveLocationTask(): void {
  if (TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) return;

  TaskManager.defineTask<LocationTaskData>(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      captureException(error);
      return;
    }

    try {
      const expiresAtStr = await AsyncStorage.getItem(STORAGE_KEYS.LIVE_LOCATION_EXPIRES_AT);
      if (expiresAtStr !== null) {
        const expiresAtMs = Number(expiresAtStr);
        if (!Number.isNaN(expiresAtMs) && Date.now() >= expiresAtMs) {
          const sessionId = await AsyncStorage.getItem(STORAGE_KEYS.LIVE_LOCATION_SESSION_ID);
          if (sessionId !== null) {
            await stopLiveLocationSession(sessionId);
          }
          await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
          await AsyncStorage.multiRemove([
            STORAGE_KEYS.LIVE_LOCATION_SESSION_ID,
            STORAGE_KEYS.LIVE_LOCATION_EXPIRES_AT,
          ]);
          return;
        }
      }

      const fix = data?.locations?.[0];
      if (fix === undefined) return;

      const sessionId = await AsyncStorage.getItem(STORAGE_KEYS.LIVE_LOCATION_SESSION_ID);
      if (sessionId === null) return;
      await updateLiveLocation(sessionId, fix.coords.latitude, fix.coords.longitude);
    } catch (taskError) {
      captureException(taskError);
    }
  });
}

export interface UseLiveLocationResult {
  isActive: boolean;
  sessionId: string | null;
  expiresAt: Date | null;
  currentLocationUrl: string | null;
  startSharing: (sharedWithUserIds: string[], durationHours: number) => Promise<void>;
  stopSharing: () => Promise<void>;
  extendTime: (hours: number) => Promise<void>;
}

/** Owns the live-location sharing lifecycle: session, background task, SMS. */
export function useLiveLocation(): UseLiveLocationResult {
  const isActive = useLocationStore((state) => state.isLiveLocationActive);
  const sessionId = useLocationStore((state) => state.liveLocationSessionId);
  const currentLocation = useLocationStore((state) => state.currentLocation);
  const setLiveLocationActive = useLocationStore((state) => state.setLiveLocationActive);

  const surakshakUser = useAuthStore((state) => state.surakshakUser);
  const rawUser = useAuthStore((state) => state.user);
  const userId = surakshakUser?.userId ?? rawUser?.uid ?? null;

  const [expiresAt, setExpiresAt] = useState<Date | null>(null);

  const stopSharing = useCallback(async (): Promise<void> => {
    const activeSessionId = useLocationStore.getState().liveLocationSessionId;
    if (activeSessionId === null) return;

    await stopLiveLocationSession(activeSessionId);
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.LIVE_LOCATION_SESSION_ID,
      STORAGE_KEYS.LIVE_LOCATION_EXPIRES_AT,
    ]);
    setLiveLocationActive(false);
    setExpiresAt(null);

    try {
      const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (started) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    } catch (error) {
      console.warn('stopSharing: background task was not running:', error);
    }

    trackLiveLocationStopped();
  }, [setLiveLocationActive]);

  // Restore an active session on mount (e.g. after an app restart).
  useEffect(() => {
    if (userId === null) return;
    let cancelled = false;

    void getActiveLiveSession(userId)
      .then((session) => {
        if (cancelled || session === null || !session.isActive) return;
        const expiry = session.expiresAt.toDate();
        if (expiry > new Date()) {
          setLiveLocationActive(true, session.id);
          setExpiresAt(expiry);
          void AsyncStorage.multiSet([
            [STORAGE_KEYS.LIVE_LOCATION_SESSION_ID, session.id],
            [STORAGE_KEYS.LIVE_LOCATION_EXPIRES_AT, String(expiry.getTime())],
          ]);
        } else {
          void stopLiveLocationSession(session.id);
          void AsyncStorage.multiRemove([
            STORAGE_KEYS.LIVE_LOCATION_SESSION_ID,
            STORAGE_KEYS.LIVE_LOCATION_EXPIRES_AT,
          ]);
        }
      })
      .catch((error: unknown) => captureException(error));

    return (): void => {
      cancelled = true;
    };
  }, [userId, setLiveLocationActive]);

  // Auto-stop when the session expires. Always deferred through a timer so the
  // stop (which sets state) never runs synchronously inside the effect body.
  useEffect(() => {
    if (expiresAt === null || !isActive) return;
    const ms = Math.max(0, expiresAt.getTime() - Date.now());
    const timer = setTimeout(() => void stopSharing(), ms);
    return (): void => clearTimeout(timer);
  }, [expiresAt, isActive, stopSharing]);

  const startSharing = useCallback(
    async (sharedWithUserIds: string[], durationHours: number): Promise<void> => {
      if (userId === null) throw new Error('Not authenticated');

      const fix = await getCurrentLocation();
      const newSessionId = await createLiveLocationSession(
        userId,
        sharedWithUserIds,
        durationHours,
        fix.latitude,
        fix.longitude,
      );

      const expiryDate = new Date(Date.now() + durationHours * MS_PER_HOUR);
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.LIVE_LOCATION_SESSION_ID, newSessionId],
        [STORAGE_KEYS.LIVE_LOCATION_EXPIRES_AT, String(expiryDate.getTime())],
      ]);
      setLiveLocationActive(true, newSessionId);
      setExpiresAt(expiryDate);

      const backgroundGranted = await requestBackgroundLocationPermission();
      if (backgroundGranted) {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: APP_CONFIG.LIVE_LOCATION_UPDATE_INTERVAL_SECONDS * 1000,
          distanceInterval: APP_CONFIG.LIVE_LOCATION_DISTANCE_INTERVAL_METERS,
          pausesUpdatesAutomatically: false,
          foregroundService: {
            notificationTitle: i18n.t('home.title'),
            notificationBody: i18n.t('location.sharingNotification'),
            notificationColor: COLORS.PRIMARY_RED,
          },
        });
      }

      const { emergencyContacts, profile } = useUserStore.getState();
      const selected = emergencyContacts.filter((contact) =>
        sharedWithUserIds.includes(contact.id),
      );
      const name = surakshakUser?.name ?? profile?.name ?? 'User';
      const language = surakshakUser?.language ?? profile?.language ?? 'en';
      const locationUrl = getLocationUrl(fix.latitude, fix.longitude);

      const untilTime = formatClockTime(expiryDate);
      const result = await sendLiveLocationShare(selected, locationUrl, name, untilTime, language);
      await recordSMSAlert({
        type: 'live_location',
        locationUrl,
        contactsSent: result.sent,
        contactsFailed: result.failed,
      });

      trackLiveLocationStarted(sharedWithUserIds.length, durationHours);
    },
    [userId, setLiveLocationActive, surakshakUser],
  );

  const extendTime = useCallback(
    async (hours: number): Promise<void> => {
      const activeSessionId = useLocationStore.getState().liveLocationSessionId;
      if (activeSessionId === null || userId === null) return;

      await extendLiveLocationSession(activeSessionId, hours);
      const refreshed = await getActiveLiveSession(userId);
      if (refreshed !== null) {
        const newExpiry = refreshed.expiresAt.toDate();
        setExpiresAt(newExpiry);
        await AsyncStorage.setItem(
          STORAGE_KEYS.LIVE_LOCATION_EXPIRES_AT,
          String(newExpiry.getTime()),
        );
      }

      trackLiveLocationExtended(hours);
    },
    [userId],
  );

  const currentLocationUrl =
    currentLocation === null
      ? null
      : getLocationUrl(currentLocation.latitude, currentLocation.longitude);

  return {
    isActive,
    sessionId,
    expiresAt,
    currentLocationUrl,
    startSharing,
    stopSharing,
    extendTime,
  };
}
