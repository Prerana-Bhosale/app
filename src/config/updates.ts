import * as Updates from 'expo-updates';

import { trackOtaUpdateApplied, trackOtaUpdateAvailable } from '@/services/analytics.service';
import { metroLogger } from '@/utils/logger.utils';

/**
 * Thin wrapper around `expo-updates` — screens/hooks never call the module
 * directly, mirroring the other src/config wrappers (sentry.ts, mixpanel.ts).
 * `Updates.isEnabled` is false in Expo Go and in local dev (always
 * APP_ENV=dev per CLAUDE.md, which never ships an update URL for OTA), so
 * every export here is a safe no-op there.
 */

export interface OtaUpdateInfo {
  isAvailable: boolean;
  updateId: string | null;
}

export async function checkForOtaUpdate(): Promise<OtaUpdateInfo> {
  if (!Updates.isEnabled) return { isAvailable: false, updateId: null };

  try {
    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) return { isAvailable: false, updateId: null };
    const updateId = result.manifest.id;
    trackOtaUpdateAvailable(updateId);
    return { isAvailable: true, updateId };
  } catch (error) {
    metroLogger.warn('checkForOtaUpdate failed', {
      domain: 'SYSTEM',
      operation: 'checkForOtaUpdate',
      error,
    });
    return { isAvailable: false, updateId: null };
  }
}

/** Downloads the pending update and restarts the app to launch it. */
export async function applyOtaUpdate(): Promise<void> {
  if (!Updates.isEnabled) return;

  try {
    const fetchResult = await Updates.fetchUpdateAsync();
    const updateId = fetchResult.manifest?.id ?? Updates.updateId ?? 'unknown';
    trackOtaUpdateApplied(updateId);
    await Updates.reloadAsync();
  } catch (error) {
    console.error('applyOtaUpdate failed:', error);
    throw error;
  }
}

/** A short, stable identifier for the running bundle, for display in "About". */
export function getRunningUpdateHash(): string | null {
  if (Updates.isEmbeddedLaunch || Updates.updateId === null) return null;
  return Updates.updateId.slice(0, 8);
}
