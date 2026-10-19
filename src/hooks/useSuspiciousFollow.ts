import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';

import { APP_CONFIG } from '@/constants/config';
import { STORAGE_FLAG_OFF, STORAGE_KEYS } from '@/constants/storage';
import { trackSuspiciousFollowDetected } from '@/services/analytics.service';
import { scheduleLocalNotification } from '@/services/notification.service';
import { getDistanceKm } from '@/utils/location.utils';

const METERS_PER_KM = 1000;
const MIN_SNAPSHOTS_FOR_MOVEMENT_CHECK = 3;
const MIN_SNAPSHOTS_FOR_FOLLOW_CHECK = 5;
const HISTORY_WINDOW_MINUTES = 20;
const MS_PER_MINUTE = 60_000;

interface LocationSnapshot {
  latitude: number;
  longitude: number;
  timestamp: number;
}

function metersBetween(a: LocationSnapshot, b: { latitude: number; longitude: number }): number {
  return getDistanceKm(a.latitude, a.longitude, b.latitude, b.longitude) * METERS_PER_KM;
}

async function isFollowDetectionEnabled(): Promise<boolean> {
  const setting = await AsyncStorage.getItem(STORAGE_KEYS.FOLLOW_DETECTION_ENABLED);
  return setting !== STORAGE_FLAG_OFF;
}

async function triggerFollowAlert(): Promise<void> {
  trackSuspiciousFollowDetected();
  await scheduleLocalNotification(
    '⚠️ Suspicious Activity Detected',
    'You may be being followed. Tap for safety options.',
    0,
    { type: 'suspicious_follow' },
  );
}

/**
 * Flags a possible follow: the device stays inside `FOLLOW_RADIUS_METERS` for
 * `FOLLOW_DURATION_MINUTES` after having moved at least `FOLLOW_MIN_MOVEMENT_METERS`
 * — i.e. the user was travelling, then something has kept pace with them.
 * Fires at most once per mount (see `alertFiredRef`), mirroring
 * `useShakeDetection`'s single-fire-then-reset pattern.
 */
export function useSuspiciousFollow(enabled: boolean): void {
  const alertFiredRef = useRef(false);
  const historyRef = useRef<LocationSnapshot[]>([]);

  useEffect(() => {
    if (!enabled) return;

    alertFiredRef.current = false;
    historyRef.current = [];

    async function checkForFollow(): Promise<void> {
      if (alertFiredRef.current) return;
      if (!(await isFollowDetectionEnabled())) return;

      const permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted) return;

      try {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const snapshot: LocationSnapshot = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: Date.now(),
        };

        const cutoff = Date.now() - HISTORY_WINDOW_MINUTES * MS_PER_MINUTE;
        historyRef.current = [
          ...historyRef.current.filter((entry) => entry.timestamp > cutoff),
          snapshot,
        ];

        if (historyRef.current.length < MIN_SNAPSHOTS_FOR_MOVEMENT_CHECK) return;

        const oldest = historyRef.current[0];
        if (oldest === undefined) return;
        const totalMovement = metersBetween(oldest, snapshot);
        if (totalMovement < APP_CONFIG.FOLLOW_MIN_MOVEMENT_METERS) return;

        const followCutoff = Date.now() - APP_CONFIG.FOLLOW_DURATION_MINUTES * MS_PER_MINUTE;
        const recentHistory = historyRef.current.filter((entry) => entry.timestamp > followCutoff);
        if (recentHistory.length < MIN_SNAPSHOTS_FOR_FOLLOW_CHECK) return;

        const allWithinRadius = recentHistory.every(
          (entry) => metersBetween(entry, snapshot) <= APP_CONFIG.FOLLOW_RADIUS_METERS,
        );
        if (!allWithinRadius) return;

        alertFiredRef.current = true;
        await triggerFollowAlert();
      } catch (error) {
        console.warn('useSuspiciousFollow: could not get position fix:', error);
      }
    }

    const interval = setInterval(
      () => void checkForFollow(),
      APP_CONFIG.FOLLOW_CHECK_INTERVAL_SECONDS * 1000,
    );

    return (): void => clearInterval(interval);
  }, [enabled]);
}
