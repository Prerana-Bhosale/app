/**
 * Every AsyncStorage key the app reads or writes. Centralised so a rename can
 * never drift between the writer and the reader (absolute rule 6).
 */
export const STORAGE_KEYS = {
  /** `'true'` once the user has finished the onboarding wizard. */
  ONBOARDING_COMPLETE: 'surakshak_onboarding_complete',
  /** `'false'` disables shake-to-SOS; anything else (or absent) means enabled. */
  SHAKE_ENABLED: 'surakshak_shake_enabled',
  /** `'false'` disables the low-battery alert; absent means enabled. */
  LOW_BATTERY_ENABLED: 'surakshak_low_battery_enabled',
  /** `JSON.stringify`'d `SMSAlertRecord[]`, newest first, capped at 50. */
  SMS_HISTORY: 'surakshak_sms_history',
  /**
   * `JSON.stringify`'d `EmergencyContact[]` (predefined helplines + the
   * user's own), refreshed on every successful Firestore read. Read back as
   * a fallback when SOS/battery alerts fire with an empty store — e.g. app
   * killed and relaunched offline before the store rehydrates.
   */
  EMERGENCY_CONTACTS_CACHE: 'surakshak_emergency_contacts_cache',
  /** `JSON.stringify`'d `OfflineUserCache` (name + language), same fallback use. */
  USER_INFO_CACHE: 'surakshak_user_info_cache',
  /**
   * Id of the currently active live-location session. Read by the background
   * location task (which has no access to the Zustand store) to know which
   * Firestore document to push coordinates into.
   */
  LIVE_LOCATION_SESSION_ID: 'surakshak_live_session_id',
  /** `'false'` disables the suspicious-follow alert; absent means enabled. */
  FOLLOW_DETECTION_ENABLED: 'surakshak_follow_detection_enabled',
  /** `'true'` while a Safe Check-In session is running. */
  CHECKIN_ACTIVE: 'surakshak_checkin_active',
  /** The chosen check-in interval, in minutes, as a string. */
  CHECKIN_INTERVAL_MINUTES: 'surakshak_checkin_interval',
  /** ISO timestamp of the next check-in deadline. */
  CHECKIN_NEXT_AT: 'surakshak_checkin_next_at',
  /** `JSON.stringify`'d array of emergency-contact ids to alert on a miss. */
  CHECKIN_CONTACT_IDS: 'surakshak_checkin_contacts',
  /** `'true'` once the iOS one-tap-limitation hint on Home has been dismissed. */
  IOS_HINT_DISMISSED: 'surakshak_ios_hint_dismissed',
  /** Consecutive missed check-ins since the last successful one. */
  CHECKIN_MISSED_COUNT: 'surakshak_checkin_missed',
  /** `'true'` once Disguise Mode is turned on. */
  DISGUISE_ENABLED: 'surakshak_disguise_enabled',
  /** SHA-256 hex digest of the disguise PIN — never the raw digits. */
  DISGUISE_PIN_HASH: 'surakshak_disguise_pin_hash',
  /**
   * `JSON.stringify`'d `EvidenceRecordingRecord[]`, newest first, capped at
   * `EVIDENCE_RECORDING_HISTORY_LIMIT`. The Storage upload itself is the
   * durable copy of a recording; this is only a local index so a user can
   * find links to their own past uploads again on this device.
   */
  EVIDENCE_RECORDING_HISTORY: 'surakshak_evidence_recording_history',
  /**
   * `JSON.stringify`'d string[] of Safe Journey session IDs marked arrived locally/offline,
   * preventing the watchdog from firing false-alarm overdue emergency alerts.
   */
  SAFE_JOURNEY_ARRIVED_SESSIONS: 'surakshak_safe_journey_arrived_sessions',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/**
 * AsyncStorage keys that hold user-sensitive profile data, contacts, or transient
 * emergency/safety session state. Purged upon user sign-out to prevent
 * cross-account data leakage on shared devices.
 */
export const SENSITIVE_STORAGE_KEYS = [
  STORAGE_KEYS.EMERGENCY_CONTACTS_CACHE,
  STORAGE_KEYS.USER_INFO_CACHE,
  STORAGE_KEYS.SMS_HISTORY,
  STORAGE_KEYS.EVIDENCE_RECORDING_HISTORY,
  STORAGE_KEYS.LIVE_LOCATION_SESSION_ID,
  STORAGE_KEYS.SAFE_JOURNEY_ARRIVED_SESSIONS,
  STORAGE_KEYS.CHECKIN_ACTIVE,
  STORAGE_KEYS.CHECKIN_INTERVAL_MINUTES,
  STORAGE_KEYS.CHECKIN_NEXT_AT,
  STORAGE_KEYS.CHECKIN_CONTACT_IDS,
  STORAGE_KEYS.CHECKIN_MISSED_COUNT,
  STORAGE_KEYS.ONBOARDING_COMPLETE,
] as const;

export type SensitiveStorageKey = (typeof SENSITIVE_STORAGE_KEYS)[number];

/** Canonical truthy value written for boolean-style flags. */
export const STORAGE_FLAG_ON = 'true';

/** A boolean flag counts as disabled only when it was explicitly set to this. */
export const STORAGE_FLAG_OFF = 'false';
