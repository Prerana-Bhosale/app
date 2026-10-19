import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { captureException } from '@/config/sentry';
import { APP_CONFIG } from '@/constants/config';
import i18n from '@/i18n';
import { trackSafeJourneyAlertSent } from '@/services/analytics.service';
import {
  cancelSafeJourney,
  getActiveJourneySession,
  markAlertSent,
  markSafeJourneyArrived,
} from '@/services/firebase/safe-journey.service';
import { buildLocationUrl, getLocationWithTimeout } from '@/services/location.service';
import {
  cancelLocalNotification,
  scheduleLocalNotification,
} from '@/services/notification.service';
import { recordSMSAlert, sendSafeJourneyAlert } from '@/services/sms.service';
import { useAuthStore } from '@/stores/auth.store';
import { useLocationStore } from '@/stores/location.store';
import { useUserStore } from '@/stores/user.store';
import type { SafeJourneySession } from '@/types/location.types';
import { formatClockTime } from '@/utils/date.utils';
import {
  clearSafeJourneyArrivedOffline,
  getCachedEmergencyContacts,
  isSafeJourneyArrivedOffline,
} from '@/utils/offline-cache.utils';

const WARNING_NOTIFICATION_ID = 'surakshak_journey_warning';
const DUE_NOTIFICATION_ID = 'surakshak_journey_due';
const MS_PER_SECOND = 1000;
const MS_PER_HOUR = 3_600_000;
/** Re-check just after the deadline rather than exactly on it. */
const DEADLINE_GRACE_MS = 500;

async function cancelJourneyNotifications(): Promise<void> {
  await Promise.all([
    cancelLocalNotification(WARNING_NOTIFICATION_ID).catch(() => undefined),
    cancelLocalNotification(DUE_NOTIFICATION_ID).catch(() => undefined),
  ]);
}

/**
 * Local reminders that fire even when the app is backgrounded or killed: a
 * heads-up shortly before the deadline, and an "are you safe?" at it.
 */
async function scheduleJourneyNotifications(deadline: number, now: number): Promise<void> {
  await cancelJourneyNotifications();
  const secondsLeft = Math.floor((deadline - now) / MS_PER_SECOND);
  const warnInSeconds = secondsLeft - APP_CONFIG.SAFE_JOURNEY_ALERT_WARN_SECONDS;
  if (warnInSeconds > 0) {
    await scheduleLocalNotification(
      i18n.t('location.journeyWarningTitle'),
      i18n.t('location.journeyWarningBody'),
      warnInSeconds,
      { type: 'safe_journey' },
      WARNING_NOTIFICATION_ID,
    );
  }
  await scheduleLocalNotification(
    i18n.t('location.journeyDueTitle'),
    i18n.t('location.journeyDueBody'),
    secondsLeft,
    { type: 'safe_journey' },
    DUE_NOTIFICATION_ID,
  );
}

/** Texts the journey's contacts that she has not checked in. */
async function sendOverdueAlert(session: SafeJourneySession): Promise<void> {
  // Status first: stops a second device / the server from alerting again.
  await markAlertSent(session.id);

  const { emergencyContacts, profile } = useUserStore.getState();
  const surakshakUser = useAuthStore.getState().surakshakUser;
  const pool =
    emergencyContacts.length > 0 ? emergencyContacts : await getCachedEmergencyContacts();
  const contacts = pool.filter((contact) => session.sharedWithUserIds.includes(contact.id));

  let locationUrl = buildLocationUrl(session.destinationLatitude, session.destinationLongitude);
  try {
    const fix = await getLocationWithTimeout();
    locationUrl = buildLocationUrl(fix.latitude, fix.longitude);
  } catch (locationError) {
    console.warn('safe-journey: location unavailable for alert:', locationError);
  }

  const result = await sendSafeJourneyAlert(
    contacts,
    locationUrl,
    surakshakUser?.name ?? profile?.name ?? 'User',
    session.destinationName,
    formatClockTime(session.expectedArrivalAt.toDate()),
    surakshakUser?.language ?? profile?.language ?? 'en',
  );
  await recordSMSAlert({
    type: 'safe_journey',
    locationUrl,
    contactsSent: result.sent,
    contactsFailed: result.failed,
  });
  trackSafeJourneyAlertSent();
}

/**
 * App-wide Safe Journey watchdog, mounted once in the root layout.
 *
 * The countdown used to live only inside the Safe Journey screen, so the
 * overdue alert fired only if that screen happened to be open in the
 * foreground when time ran out (BUG-029). This instead re-reads the active
 * journey on sign-in, whenever its deadline changes, every time the app
 * returns to the foreground, and on a timer at the deadline — and keeps
 * local notifications scheduled so a backgrounded or killed app still
 * prompts the user. The server-side `checkOverdueJourneys` function adds a
 * push on top for when the app is not opened at all.
 */
export function useSafeJourneyMonitor(userId: string | null): void {
  const setSafeJourneyActive = useLocationStore((state) => state.setSafeJourneyActive);
  const revision = useLocationStore((state) => state.safeJourneyRevision);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkingRef = useRef(false);
  const rerunRef = useRef(false);
  const checkRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const clearTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const check = useCallback(async (): Promise<void> => {
    if (userId === null) return;
    if (checkingRef.current) {
      rerunRef.current = true;
      return;
    }
    checkingRef.current = true;
    clearTimer();
    try {
      const session = await getActiveJourneySession(userId);
      if (session === null || (await isSafeJourneyArrivedOffline(session.id))) {
        setSafeJourneyActive(false);
        await cancelJourneyNotifications();
        if (session !== null) {
          markSafeJourneyArrived(session.id)
            .then(() => clearSafeJourneyArrivedOffline(session.id))
            .catch(() => undefined);
        }
        return;
      }

      const deadline = session.expectedArrivalAt.toDate().getTime();
      const now = Date.now();
      if (deadline > now) {
        setSafeJourneyActive(true, session.id);
        await scheduleJourneyNotifications(deadline, now);
        timerRef.current = setTimeout(
          () => void checkRef.current(),
          deadline - now + DEADLINE_GRACE_MS,
        );
        return;
      }

      await cancelJourneyNotifications();
      if (now - deadline > APP_CONFIG.SAFE_JOURNEY_STALE_HOURS * MS_PER_HOUR) {
        await cancelSafeJourney(session.id);
      } else {
        await sendOverdueAlert(session);
      }
      setSafeJourneyActive(false);
    } catch (error) {
      captureException(error);
    } finally {
      checkingRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        void checkRef.current();
      }
    }
  }, [userId, clearTimer, setSafeJourneyActive]);

  useEffect(() => {
    checkRef.current = check;
  }, [check]);

  // Initial read, plus a re-read every time a screen changes the deadline.
  // Deferred so the effect body itself never sets state synchronously.
  useEffect(() => {
    if (userId === null) return;
    const timer = setTimeout(() => void check(), 0);
    return (): void => clearTimeout(timer);
  }, [userId, revision, check]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkRef.current();
    });
    return (): void => subscription.remove();
  }, []);

  useEffect(() => clearTimer, [clearTimer]);
}
