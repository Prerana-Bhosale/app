import { requireNativeModule } from 'expo-modules-core';

import type { CallResult, SendSmsResult } from './SurakshakNative.types';

interface SurakshakNativeModuleInterface {
  sendSms: (phoneNumber: string, message: string) => Promise<string>;
  checkSmsPermission: () => Promise<boolean>;
  placeCall: (phoneNumber: string) => Promise<string>;
  setProximityScreenOff: (enabled: boolean) => Promise<void>;
  setAppIcon: (name: string | null) => Promise<void>;
  startSiren: (audioUri: string) => Promise<void>;
  stopSiren: () => Promise<void>;
}

const NativeModule = requireNativeModule<SurakshakNativeModuleInterface>('SurakshakNative');

/**
 * Sends one SMS directly, with no compose UI and no user interaction, using
 * the device SIM (Android only — `SEND_SMS` permission required). Callers on
 * iOS should not reach this function at all; the JS-layer service falls back
 * to `expo-sms` there instead, since Apple has no equivalent silent-send API.
 */
export async function sendSmsDirect(phone: string, message: string): Promise<SendSmsResult> {
  try {
    await NativeModule.sendSms(phone, message);
    return { success: true, phone, method: 'direct' };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return { success: false, phone, error: err.message, method: 'direct' };
  }
}

/** Sends the same message to every phone in parallel, each a separate silent send. */
export async function sendSmsToContacts(
  phones: string[],
  message: string,
): Promise<SendSmsResult[]> {
  const results = await Promise.allSettled(phones.map((phone) => sendSmsDirect(phone, message)));
  return results.map((result, index) =>
    result.status === 'fulfilled'
      ? result.value
      : { success: false, phone: phones[index] ?? '', error: 'Failed', method: 'direct' as const },
  );
}

/** Whether `SEND_SMS` is currently granted (Android only; always `true` on iOS). */
export async function checkSmsPermission(): Promise<boolean> {
  return NativeModule.checkSmsPermission();
}

/**
 * Places a call directly via `Intent.ACTION_CALL` — no dialer shown, no user
 * tap (Android only — `CALL_PHONE` permission required). Callers on iOS
 * should not reach this function; the JS-layer util falls back to
 * `Linking.openURL('tel:...')` there instead, since Apple has no equivalent
 * silent-call API.
 */
export async function placeCallDirectly(phone: string): Promise<CallResult> {
  await NativeModule.placeCall(phone);
  return { success: true, phone, method: 'direct' };
}

/**
 * Turns the screen off while the phone is held to the ear (proximity
 * sensor), as during a real call. Best-effort: devices without a proximity
 * sensor simply keep the screen on.
 */
export async function setProximityScreenOff(enabled: boolean): Promise<void> {
  await NativeModule.setProximityScreenOff(enabled);
}

/**
 * Switches the launcher icon and name to a registered alternate (`null` for
 * the default). Android toggles `activity-alias` launchers; iOS uses
 * `setAlternateIconName`. Both are registered by `plugins/withDisguiseIcon.js`.
 */
export async function setAppIcon(name: string | null): Promise<void> {
  await NativeModule.setAppIcon(name);
}

/**
 * Starts the emergency siren using Android's alarm audio stream.
 */
export async function startSiren(audioUri: string): Promise<void> {
  await NativeModule.startSiren(audioUri);
}

/**
 * Stops the emergency siren and restores the previous alarm volume.
 */
export async function stopSiren(): Promise<void> {
  await NativeModule.stopSiren();
}

export type { CallResult, SendSmsResult } from './SurakshakNative.types';
