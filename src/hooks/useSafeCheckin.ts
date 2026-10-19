import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { captureException } from '@/config/sentry';
import { APP_CONFIG, LOCATION_UNAVAILABLE } from '@/constants/config';
import { STORAGE_KEYS } from '@/constants/storage';
import i18n from '@/i18n';
import {
  trackSafeCheckinAlertSent,
  trackSafeCheckinMissed,
  trackSafeCheckinStarted,
} from '@/services/analytics.service';
import { buildLocationUrl, getCurrentLocation } from '@/services/location.service';
import {
  cancelLocalNotification,
  scheduleLocalNotification,
} from '@/services/notification.service';
import { recordSMSAlert, sendCheckInMissedAlert } from '@/services/sms.service';
import { useAuthStore } from '@/stores/auth.store';
import { useUserStore } from '@/stores/user.store';

const NOTIFICATION_ID = 'surakshak_checkin';
const REMINDER_DELAY_SECONDS = 5 * 60;
const MS_PER_MINUTE = 60_000;

export interface UseSafeCheckinResult {
  isActive: boolean;
  intervalMinutes: number;
  selectedContactIds: string[];
  nextCheckInAt: Date | null;
  missedCount: number;
  isLoading: boolean;
  setSelectedContactIds: (ids: string[]) => void;
  setIntervalMinutes: (minutes: number) => void;
  start: () => Promise<void>;
  checkIn: () => Promise<void>;
  stop: () => Promise<void>;
}

async function persistNextCheckIn(nextAt: Date, missed: number): Promise<void> {
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.CHECKIN_NEXT_AT, nextAt.toISOString()],
    [STORAGE_KEYS.CHECKIN_MISSED_COUNT, String(missed)],
  ]);
}

/** Owns the Safe Check-In lifecycle: interval, contacts, missed-count, SMS escalation. */
export function useSafeCheckin(): UseSafeCheckinResult {
  const [isActive, setIsActive] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState<number>(
    APP_CONFIG.SAFE_JOURNEY_ETA_DEFAULT_MINUTES,
  );
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [nextCheckInAt, setNextCheckInAt] = useState<Date | null>(null);
  const [missedCount, setMissedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const checkingRef = useRef(false);

  const stop = useCallback(async (): Promise<void> => {
    setIsActive(false);
    setNextCheckInAt(null);
    setMissedCount(0);
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.CHECKIN_ACTIVE,
      STORAGE_KEYS.CHECKIN_INTERVAL_MINUTES,
      STORAGE_KEYS.CHECKIN_NEXT_AT,
      STORAGE_KEYS.CHECKIN_CONTACT_IDS,
      STORAGE_KEYS.CHECKIN_MISSED_COUNT,
    ]);
    await cancelLocalNotification(NOTIFICATION_ID).catch(() => undefined);
  }, []);

  const sendMissedAlert = useCallback(async (): Promise<void> => {
    try {
      const { emergencyContacts, profile } = useUserStore.getState();
      const surakshakUser = useAuthStore.getState().surakshakUser;
      const contactIds = selectedContactIds;
      const contacts = emergencyContacts.filter((contact) => contactIds.includes(contact.id));
      const name = surakshakUser?.name ?? profile?.name ?? 'User';
      const language = surakshakUser?.language ?? profile?.language ?? 'en';

      let locationUrl = LOCATION_UNAVAILABLE;
      try {
        const fix = await getCurrentLocation();
        locationUrl = buildLocationUrl(fix.latitude, fix.longitude);
      } catch (locationError) {
        console.warn('safe check-in alert: location unavailable:', locationError);
      }

      const result = await sendCheckInMissedAlert(contacts, locationUrl, name, language);
      await recordSMSAlert({
        type: 'checkin_missed',
        locationUrl,
        contactsSent: result.sent,
        contactsFailed: result.failed,
      });
      trackSafeCheckinAlertSent();
    } catch (error) {
      captureException(error);
    }
  }, [selectedContactIds]);

  /** Compares the persisted deadline against now; escalates or reminds. */
  const checkForMissed = useCallback(async (): Promise<void> => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const active = await AsyncStorage.getItem(STORAGE_KEYS.CHECKIN_ACTIVE);
      if (active !== 'true') return;

      const nextAtRaw = await AsyncStorage.getItem(STORAGE_KEYS.CHECKIN_NEXT_AT);
      if (nextAtRaw === null) return;
      const nextAt = new Date(nextAtRaw);
      if (nextAt.getTime() > Date.now()) return;

      const missedRaw = await AsyncStorage.getItem(STORAGE_KEYS.CHECKIN_MISSED_COUNT);
      const missed = (missedRaw === null ? 0 : Number(missedRaw)) + 1;
      trackSafeCheckinMissed();

      if (missed >= APP_CONFIG.SAFE_CHECKIN_MISSED_COUNT_BEFORE_ALERT) {
        await sendMissedAlert();
        await stop();
        return;
      }

      const reminderAt = new Date(Date.now() + REMINDER_DELAY_SECONDS * 1000);
      await persistNextCheckIn(reminderAt, missed);
      setNextCheckInAt(reminderAt);
      setMissedCount(missed);
      await cancelLocalNotification(NOTIFICATION_ID).catch(() => undefined);
      await scheduleLocalNotification(
        i18n.t('safeCheckin.notificationTitle'),
        i18n.t('safeCheckin.notificationBody'),
        REMINDER_DELAY_SECONDS,
        { type: 'safe_checkin' },
      );
    } catch (error) {
      captureException(error);
    } finally {
      checkingRef.current = false;
    }
  }, [sendMissedAlert, stop]);

  // Restore persisted state on mount, then reconcile against the clock.
  useEffect(() => {
    async function restore(): Promise<void> {
      try {
        const entries = await AsyncStorage.multiGet([
          STORAGE_KEYS.CHECKIN_ACTIVE,
          STORAGE_KEYS.CHECKIN_INTERVAL_MINUTES,
          STORAGE_KEYS.CHECKIN_NEXT_AT,
          STORAGE_KEYS.CHECKIN_CONTACT_IDS,
          STORAGE_KEYS.CHECKIN_MISSED_COUNT,
        ]);
        const stored = new Map(entries);
        const active = stored.get(STORAGE_KEYS.CHECKIN_ACTIVE) === 'true';
        setIsActive(active);

        const storedInterval = stored.get(STORAGE_KEYS.CHECKIN_INTERVAL_MINUTES);
        if (storedInterval !== null && storedInterval !== undefined) {
          setIntervalMinutes(Number(storedInterval));
        }

        const storedContacts = stored.get(STORAGE_KEYS.CHECKIN_CONTACT_IDS);
        if (storedContacts !== null && storedContacts !== undefined) {
          const parsed: unknown = JSON.parse(storedContacts);
          if (Array.isArray(parsed)) setSelectedContactIds(parsed as string[]);
        }

        const storedNextAt = stored.get(STORAGE_KEYS.CHECKIN_NEXT_AT);
        if (active && storedNextAt !== null && storedNextAt !== undefined) {
          setNextCheckInAt(new Date(storedNextAt));
        }

        const storedMissed = stored.get(STORAGE_KEYS.CHECKIN_MISSED_COUNT);
        if (storedMissed !== null && storedMissed !== undefined) {
          setMissedCount(Number(storedMissed));
        }
      } catch (error) {
        captureException(error);
      } finally {
        setIsLoading(false);
      }
    }

    void restore();
  }, []);

  // Reconcile against the clock once restore has finished, then again every
  // time the app returns to foreground — this is how a missed check-in is
  // detected (see Phase 7 plan's Correction 9: expo-notifications' "dismissed"
  // event isn't reliably observable).
  useEffect(() => {
    if (isLoading) return;

    // Deferred rather than called directly: the check itself is safe (no
    // setState before its first `await`), but running it straight from the
    // effect body reads, to static analysis, like an effect that sets state
    // synchronously — a zero-delay timer keeps it as a callback instead,
    // exactly like the AppState listener below.
    const timer = setTimeout(() => void checkForMissed(), 0);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkForMissed();
    });

    return (): void => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [isLoading, checkForMissed]);

  const start = useCallback(async (): Promise<void> => {
    const nextAt = new Date(Date.now() + intervalMinutes * MS_PER_MINUTE);
    setIsActive(true);
    setNextCheckInAt(nextAt);
    setMissedCount(0);

    await AsyncStorage.multiSet([
      [STORAGE_KEYS.CHECKIN_ACTIVE, 'true'],
      [STORAGE_KEYS.CHECKIN_INTERVAL_MINUTES, String(intervalMinutes)],
      [STORAGE_KEYS.CHECKIN_NEXT_AT, nextAt.toISOString()],
      [STORAGE_KEYS.CHECKIN_CONTACT_IDS, JSON.stringify(selectedContactIds)],
      [STORAGE_KEYS.CHECKIN_MISSED_COUNT, '0'],
    ]);

    await cancelLocalNotification(NOTIFICATION_ID).catch(() => undefined);
    await scheduleLocalNotification(
      i18n.t('safeCheckin.notificationTitle'),
      i18n.t('safeCheckin.notificationBody'),
      intervalMinutes * 60,
      { type: 'safe_checkin' },
    );
    trackSafeCheckinStarted(intervalMinutes);
  }, [intervalMinutes, selectedContactIds]);

  const checkIn = useCallback(async (): Promise<void> => {
    const nextAt = new Date(Date.now() + intervalMinutes * MS_PER_MINUTE);
    setNextCheckInAt(nextAt);
    setMissedCount(0);

    await persistNextCheckIn(nextAt, 0);
    await cancelLocalNotification(NOTIFICATION_ID).catch(() => undefined);
    await scheduleLocalNotification(
      i18n.t('safeCheckin.notificationTitle'),
      i18n.t('safeCheckin.notificationBody'),
      intervalMinutes * 60,
      { type: 'safe_checkin' },
    );
  }, [intervalMinutes]);

  return {
    isActive,
    intervalMinutes,
    selectedContactIds,
    nextCheckInAt,
    missedCount,
    isLoading,
    setSelectedContactIds,
    setIntervalMinutes,
    start,
    checkIn,
    stop,
  };
}
