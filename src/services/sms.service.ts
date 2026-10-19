import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SMS from 'expo-sms';
import { Platform } from 'react-native';
import { checkSmsPermission, sendSmsToContacts } from 'surakshak-native';

import { SMS_HISTORY_LIMIT } from '@/constants/config';
import { STORAGE_KEYS } from '@/constants/storage';
import type { SMSAlertRecord, SMSAlertResult } from '@/types/emergency.types';
import type { EmergencyContact, Language } from '@/types/user.types';
import { formatIndianPhone, validateIndianPhone } from '@/utils/phone.utils';
import {
  buildCheckInMissedMessage,
  buildLiveLocationMessage,
  buildLowBatteryMessage,
  buildSafeJourneyMessage,
  buildSafeJourneyStartMessage,
  buildSafeJourneyEtaExtendedMessage,
  buildSOSMessage,
} from '@/utils/sms.utils';

/**
 * SMS is sent over the device SIM. There is a hard platform split:
 *  - iOS opens the system compose sheet pre-filled; the user taps send once.
 *  - Android sends silently in the background with no compose UI.
 * `expo-sms` never reports per-recipient delivery, and on Android always
 * resolves `{ result: 'unknown' }`, so a send is treated as all-or-nothing:
 * anything other than an explicit `'cancelled'` counts as sent.
 */

/** Reports whether the device can send SMS at all (most tablets cannot). */
export async function isSMSAvailable(): Promise<boolean> {
  try {
    return await SMS.isAvailableAsync();
  } catch (error) {
    console.error('isSMSAvailable failed:', error);
    throw error;
  }
}

/** Custom contacts with a dialable Indian mobile number, normalised to E.164. */
function resolveRecipients(contacts: EmergencyContact[]): string[] {
  return contacts
    .filter((contact) => !contact.isPredefined && validateIndianPhone(contact.phone))
    .map((contact) => formatIndianPhone(contact.phone));
}

/**
 * Android sends each recipient a message directly via `surakshak-native`
 * (`SmsManager`, `SEND_SMS` permission) — silent, no compose UI, one send
 * per recipient in parallel. iOS has no equivalent API; it keeps using
 * `expo-sms`'s single compose sheet covering every recipient at once, which
 * needs exactly one tap from the user to confirm. An Android device without
 * the `SEND_SMS` grant takes the compose-sheet path too, rather than having
 * every silent send rejected and the alert never leave the phone.
 */
async function canSendSilently(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return await checkSmsPermission();
  } catch (error) {
    console.warn('sms: could not read SEND_SMS permission:', error);
    return false;
  }
}

export interface PendingOutboxItem {
  id: string;
  recipients: string[];
  message: string;
  createdAt: number;
}

const OUTBOX_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function getPendingOutbox(): Promise<PendingOutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.EMERGENCY_OUTBOX);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - OUTBOX_TTL_MS;
    return parsed
      .filter((item): item is PendingOutboxItem => {
        return (
          typeof item === 'object' &&
          item !== null &&
          typeof (item as PendingOutboxItem).id === 'string' &&
          Array.isArray((item as PendingOutboxItem).recipients) &&
          typeof (item as PendingOutboxItem).message === 'string' &&
          typeof (item as PendingOutboxItem).createdAt === 'number'
        );
      })
      .filter((item) => item.createdAt >= cutoff);
  } catch (error) {
    console.warn('sms: could not read emergency outbox:', error);
    return [];
  }
}

export async function enqueuePendingOutbox(recipients: string[], message: string): Promise<void> {
  try {
    const existing = await getPendingOutbox();
    const newItem: PendingOutboxItem = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      recipients,
      message,
      createdAt: Date.now(),
    };
    await AsyncStorage.setItem(
      STORAGE_KEYS.EMERGENCY_OUTBOX,
      JSON.stringify([newItem, ...existing].slice(0, 5)),
    );
  } catch (error) {
    console.warn('sms: could not enqueue to emergency outbox:', error);
  }
}

export async function clearPendingOutbox(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.EMERGENCY_OUTBOX);
  } catch (error) {
    console.warn('sms: could not clear emergency outbox:', error);
  }
}

/**
 * Checks if silent SMS permissions are now granted and drains any fresh (<10 min old)
 * queued outbox alerts, sending them silently in the background.
 */
export async function flushPendingOutbox(): Promise<{ dispatched: number }> {
  if (!(await canSendSilently())) {
    return { dispatched: 0 };
  }

  const items = await getPendingOutbox();
  if (items.length === 0) {
    return { dispatched: 0 };
  }

  let count = 0;
  for (const item of items) {
    try {
      await sendSmsToContacts(item.recipients, item.message);
      count += item.recipients.length;
    } catch (error) {
      console.warn('sms: failed to flush outbox item:', error);
    }
  }

  await clearPendingOutbox();
  return { dispatched: count };
}

async function dispatch(recipients: string[], message: string): Promise<SMSAlertResult> {
  if (recipients.length === 0) return { sent: [], failed: [] };

  if (await canSendSilently()) {
    try {
      const results = await sendSmsToContacts(recipients, message);
      return {
        sent: results
          .filter((sendResult) => sendResult.success)
          .map((sendResult) => sendResult.phone),
        failed: results
          .filter((sendResult) => !sendResult.success)
          .map((sendResult) => sendResult.phone),
      };
    } catch (error) {
      // A fan-out must never throw back into the SOS flow — record the
      // failure and let the caller persist / surface it.
      console.error('sms dispatch failed:', error);
      return { sent: [], failed: recipients };
    }
  }

  try {
    const available = await SMS.isAvailableAsync();
    if (!available) return { sent: [], failed: recipients };

    const { result } = await SMS.sendSMSAsync(recipients, message);
    if (result === 'cancelled') {
      return { sent: [], failed: recipients };
    }

    // On Android, falling back to compose sheet means it is pre-filled as an unsent draft in the external SMS app.
    // Enqueue to persistent outbox so it can auto-send once permission is granted, and report draft fallback.
    if (Platform.OS === 'android') {
      await enqueuePendingOutbox(recipients, message);
      return { sent: [], failed: recipients, isDraftFallback: true };
    }

    // On iOS, compose sheet with user tap confirmation is the native platform send method.
    return { sent: recipients, failed: [] };
  } catch (error) {
    console.error('sms dispatch failed:', error);
    return { sent: [], failed: recipients };
  }
}

export async function sendSOSAlert(
  contacts: EmergencyContact[],
  locationUrl: string,
  userName: string,
  language: Language,
): Promise<SMSAlertResult> {
  return dispatch(resolveRecipients(contacts), buildSOSMessage(userName, locationUrl, language));
}

export async function sendLowBatteryAlert(
  contacts: EmergencyContact[],
  locationUrl: string,
  userName: string,
  language: Language,
): Promise<SMSAlertResult> {
  return dispatch(
    resolveRecipients(contacts),
    buildLowBatteryMessage(userName, locationUrl, language),
  );
}

export async function sendSafeJourneyAlert(
  contacts: EmergencyContact[],
  locationUrl: string,
  userName: string,
  destination: string,
  etaTime: string,
  language: Language,
): Promise<SMSAlertResult> {
  return dispatch(
    resolveRecipients(contacts),
    buildSafeJourneyMessage(userName, destination, etaTime, locationUrl, language),
  );
}

/** Lets the chosen contacts know a journey has started — not an alarm. */
export async function sendSafeJourneyStart(
  contacts: EmergencyContact[],
  locationUrl: string,
  userName: string,
  destination: string,
  etaTime: string,
  language: Language,
): Promise<SMSAlertResult> {
  return dispatch(
    resolveRecipients(contacts),
    buildSafeJourneyStartMessage(userName, destination, etaTime, locationUrl, language),
  );
}

/** Notifies chosen contacts when the user extends her journey's expected arrival time. */
export async function sendSafeJourneyEtaExtended(
  contacts: EmergencyContact[],
  destination: string,
  newEtaTime: string,
  userName: string,
  language: Language,
): Promise<SMSAlertResult> {
  return dispatch(
    resolveRecipients(contacts),
    buildSafeJourneyEtaExtendedMessage(userName, destination, newEtaTime, language),
  );
}

/** Shares a live-location session with the chosen contacts. */
export async function sendLiveLocationShare(
  contacts: EmergencyContact[],
  locationUrl: string,
  userName: string,
  untilTime: string,
  language: Language,
): Promise<SMSAlertResult> {
  return dispatch(
    resolveRecipients(contacts),
    buildLiveLocationMessage(userName, locationUrl, untilTime, language),
  );
}

export async function sendCheckInMissedAlert(
  contacts: EmergencyContact[],
  locationUrl: string,
  userName: string,
  language: Language,
): Promise<SMSAlertResult> {
  return dispatch(
    resolveRecipients(contacts),
    buildCheckInMissedMessage(userName, locationUrl, language),
  );
}

/**
 * Shares a silent-recording evidence link with the user's own emergency
 * contacts. Unlike the alert senders above this isn't tied to a fixed
 * template language lookup — the link itself carries all the information a
 * recipient needs, so the message is a short, direct sentence.
 */
export async function sendEvidenceLinkAlert(
  contacts: EmergencyContact[],
  evidenceUrl: string,
): Promise<SMSAlertResult> {
  return dispatch(resolveRecipients(contacts), `Evidence recording from Surakshak: ${evidenceUrl}`);
}

/* -------------------------- alert history -------------------------- */

export async function getSMSAlertHistory(): Promise<SMSAlertRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.SMS_HISTORY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SMSAlertRecord[]) : [];
  } catch (error) {
    console.warn('getSMSAlertHistory: could not read history:', error);
    return [];
  }
}

export async function recordSMSAlert(
  input: Pick<SMSAlertRecord, 'type' | 'locationUrl' | 'contactsSent' | 'contactsFailed'>,
): Promise<SMSAlertRecord> {
  try {
    const record: SMSAlertRecord = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      ...input,
    };
    const history = await getSMSAlertHistory();
    const next = [record, ...history].slice(0, SMS_HISTORY_LIMIT);
    await AsyncStorage.setItem(STORAGE_KEYS.SMS_HISTORY, JSON.stringify(next));
    return record;
  } catch (error) {
    console.error('recordSMSAlert failed:', error);
    throw error;
  }
}

export async function clearSMSAlertHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.SMS_HISTORY);
  } catch (error) {
    console.error('clearSMSAlertHistory failed:', error);
    throw error;
  }
}
