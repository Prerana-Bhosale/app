import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import { useEffect } from 'react';

import { captureException } from '@/config/sentry';
import { APP_CONFIG, LOCATION_UNAVAILABLE } from '@/constants/config';
import { STORAGE_FLAG_OFF, STORAGE_KEYS } from '@/constants/storage';
import { trackLowBatteryAlertSent } from '@/services/analytics.service';
import { buildLocationUrl, getCurrentLocation } from '@/services/location.service';
import { recordSMSAlert, sendLowBatteryAlert } from '@/services/sms.service';
import { useAuthStore } from '@/stores/auth.store';
import { useUserStore } from '@/stores/user.store';
import { getCachedEmergencyContacts, getCachedUserInfo } from '@/utils/offline-cache.utils';

const PERCENT = 100;

/**
 * Sends the low-battery SMS at most once per app session. The flag is module
 * scoped so a re-mount of the dashboard does not re-arm it; tests reset it with
 * `jest.resetModules()`.
 */
let alertedThisSession = false;

async function sendAlert(batteryFraction: number): Promise<void> {
  try {
    const { emergencyContacts, profile } = useUserStore.getState();
    const surakshakUser = useAuthStore.getState().surakshakUser;

    // Store empty (e.g. app relaunched offline before it rehydrates) — fall
    // back to the AsyncStorage cache rather than silently skipping the alert.
    // The cache always includes the predefined helplines (never dispatchable
    // — see `resolveRecipients` in sms.service.ts), so only its custom
    // contacts count toward "do we have anyone to actually alert".
    const contacts =
      emergencyContacts.length > 0
        ? emergencyContacts
        : (await getCachedEmergencyContacts()).filter((contact) => !contact.isPredefined);
    if (contacts.length === 0) return;

    const cachedUser =
      surakshakUser === null && profile === null ? await getCachedUserInfo() : null;
    const name = surakshakUser?.name ?? profile?.name ?? cachedUser?.name ?? 'User';
    const language = surakshakUser?.language ?? profile?.language ?? cachedUser?.language ?? 'en';

    let locationUrl = LOCATION_UNAVAILABLE;
    try {
      const fix = await getCurrentLocation();
      locationUrl = buildLocationUrl(fix.latitude, fix.longitude);
    } catch (locationError) {
      console.warn('low-battery alert: location unavailable:', locationError);
    }

    const result = await sendLowBatteryAlert(contacts, locationUrl, name, language);
    await recordSMSAlert({
      type: 'low_battery',
      locationUrl,
      contactsSent: result.sent,
      contactsFailed: result.failed,
    });
    trackLowBatteryAlertSent(Math.round(batteryFraction * PERCENT));
  } catch (error) {
    captureException(error);
  }
}

/** Watches the battery level and fires the low-battery alert on the way down. */
export function useBatteryAlert(): void {
  useEffect(() => {
    let subscription: { remove: () => void } | undefined;
    let listening = true;

    let checkingBatteryState = false;

    async function maybeFire(batteryFraction: number): Promise<void> {
      if (alertedThisSession || checkingBatteryState) return;
      if (batteryFraction * PERCENT > APP_CONFIG.LOW_BATTERY_THRESHOLD_PERCENT) return;

      checkingBatteryState = true;

      try {
        const state = await Battery.getBatteryStateAsync();

        // Never send a low-battery alert while charging or fully charged.
        if (state !== Battery.BatteryState.UNPLUGGED) {
          return;
        }

        alertedThisSession = true;
        await sendAlert(batteryFraction);
      } catch (error) {
        captureException(error);
      } finally {
        checkingBatteryState = false;
      }
    }

    async function start(): Promise<void> {
      const flag = await AsyncStorage.getItem(STORAGE_KEYS.LOW_BATTERY_ENABLED);
      if (flag === STORAGE_FLAG_OFF || !listening) return;

      const level = await Battery.getBatteryLevelAsync();
      void maybeFire(level);

      subscription = Battery.addBatteryLevelListener(({ batteryLevel }): void => {
        void maybeFire(batteryLevel);
      });
    }

    start().catch((error: unknown) => captureException(error));

    return (): void => {
      listening = false;
      subscription?.remove();
    };
  }, []);
}
