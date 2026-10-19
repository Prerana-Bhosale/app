import type { AppEnv } from '@/config/env';

/**
 * SHA-1 certificate fingerprint (uppercase hex, no colons) for each APP_ENV's
 * signing credentials, as registered against the Android app restriction on
 * `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID` in Google Cloud Console. Required
 * as the `X-Android-Cert` header on every Places API (New) REST call — an
 * Android-restricted key only auto-verifies requests made through the native
 * Maps/Places SDK; a plain `fetch()` must send `X-Android-Package` +
 * `X-Android-Cert` itself or Google blocks the request outright. Not a
 * secret — a cert fingerprint only identifies which certificate signed the
 * app, same as the value pasted into the GCP console restriction UI.
 * Get the value with `eas credentials -p android --profile <profile>`.
 */
export const ANDROID_CERT_SHA1_BY_ENV: Record<AppEnv, string> = {
  dev: '2C4000C657957C0F0E021E4E6BA39BD32EE13D63',
  staging: '526FEDE904751B7F18759F5E1F64488DFFED1CC4',
  prod: '7A6A9A81ED1EC917AB715D1137D014EB5A74E71D',
};

export const APP_CONFIG = {
  LIVE_LOCATION_DEFAULT_HOURS: 1,
  LIVE_LOCATION_MAX_HOURS: 8,
  LIVE_LOCATION_UPDATE_INTERVAL_SECONDS: 30,
  SOS_COUNTDOWN_SECONDS: 5,
  /** How long an SOS / alert waits for a fresh GPS fix before using the last known one. */
  ALERT_LOCATION_TIMEOUT_MS: 4000,
  /** A report's location fix must be no older than this to count as "here, now". */
  REPORT_LOCATION_MAX_AGE_MS: 60_000,
  SOS_TAP_COUNT: 3,
  SOS_TAP_WINDOW_MS: 1500,
  SHAKE_THRESHOLD: 2.5,
  SHAKE_COUNT_REQUIRED: 3,
  SHAKE_WINDOW_MS: 2000,
  SHAKE_SAMPLE_INTERVAL_MS: 100,
  LOW_BATTERY_THRESHOLD_PERCENT: 20,
  FAKE_CALL_DEFAULT_DELAY_SECONDS: 15,
  FAKE_CALL_RING_SECONDS: 30,
  COMMUNITY_REPORT_HIDE_THRESHOLD: 3,
  COMMUNITY_POST_MAX_LENGTH: 500,
  COMMUNITY_PAGE_SIZE: 20,
  COMMUNITY_FEED_LIMIT: 50,
  COMMUNITY_IMAGE_QUALITY: 0.7,
  SAFE_JOURNEY_CHECK_INTERVAL_MINUTES: 5,
  SAFE_CHECKIN_MISSED_COUNT_BEFORE_ALERT: 2,
  MAX_EVIDENCE_RECORDING_MINUTES: 30,
  MAX_COMMUNITY_IMAGE_MB: 5,
  UNSAFE_AREA_SEARCH_RADIUS_KM: 50,
  /** Maximum number of unsafe area pins fetched for map viewport. */
  UNSAFE_AREA_QUERY_LIMIT: 100,
  CACHE_EXPIRY_HOURS: 24,
  /** Newest-first cap on the Information Hub news feed. */
  NEWS_FEED_LIMIT: 30,
  /** Tags shown on a law list card before the rest are hidden. */
  LAW_CARD_TAG_PREVIEW_COUNT: 3,
  LIVE_LOCATION_DISTANCE_INTERVAL_METERS: 10,
  SAFE_JOURNEY_ETA_MIN_MINUTES: 5,
  SAFE_JOURNEY_ETA_MAX_MINUTES: 480,
  SAFE_JOURNEY_ETA_DEFAULT_MINUTES: 30,
  /** Countdown turns red once the journey has this many seconds or fewer left. */
  SAFE_JOURNEY_ALERT_WARN_SECONDS: 300,
  /**
   * A journey found already overdue by more than this (e.g. the app was not
   * opened for hours) is closed quietly instead of texting contacts a stale
   * "check on her immediately".
   */
  SAFE_JOURNEY_STALE_HOURS: 6,
  UNSAFE_AREA_DEFAULT_RADIUS_METERS: 200,
  NEARBY_HELP_SEARCH_RADIUS_METERS: 5000,
  NEARBY_HELP_MAX_RESULTS: 20,
  /** Bias radius for destination autocomplete around the user's location. */
  PLACE_AUTOCOMPLETE_BIAS_RADIUS_METERS: 50000,
  /** Don't hit the autocomplete API until the query is at least this long. */
  PLACE_AUTOCOMPLETE_MIN_CHARS: 3,
  /** Debounce between keystrokes and the autocomplete request. */
  PLACE_AUTOCOMPLETE_DEBOUNCE_MS: 300,
  /** Region span used when centring the map on a fresh fix. */
  MAP_DEFAULT_LATITUDE_DELTA: 0.02,
  MAP_DEFAULT_LONGITUDE_DELTA: 0.02,
  /** Mumbai — where the map opens before a location fix is available. */
  MAP_FALLBACK_LATITUDE: 19.076,
  MAP_FALLBACK_LONGITUDE: 72.8777,
  /** Base distance of the report FAB from the screen edge, before the safe-area inset. */
  MAP_FAB_OFFSET: 24,
  /**
   * Height of the floating title/legend header overlay, used to push the
   * native map controls (Android's My Location button defaults to top-right;
   * iOS's defaults to bottom-right) out from under our own UI via `mapPadding`.
   */
  MAP_HEADER_HEIGHT: 56,
  /** Clearance from the bottom-right corner needed to clear the report FAB there. */
  MAP_CONTROL_BOTTOM_CLEARANCE: 90,
  /** Digits in the Disguise Mode unlock PIN. */
  DISGUISE_PIN_LENGTH: 4,
  /** Time in the background after which Disguise Mode asks for the PIN again. */
  DISGUISE_RELOCK_AFTER_SECONDS: 30,
  /** A device must stay within this radius to count as "possibly followed". */
  FOLLOW_RADIUS_METERS: 200,
  /** Minutes spent inside `FOLLOW_RADIUS_METERS` before the alert fires. */
  FOLLOW_DURATION_MINUTES: 10,
  /** How often `useSuspiciousFollow` samples the device's position. */
  FOLLOW_CHECK_INTERVAL_SECONDS: 60,
  /** The user must have moved at least this much to count as "in transit". */
  FOLLOW_MIN_MOVEMENT_METERS: 50,
  /** Incident report field lengths. */
  INCIDENT_TITLE_MIN_LENGTH: 3,
  INCIDENT_TITLE_MAX_LENGTH: 100,
  INCIDENT_DESCRIPTION_MIN_LENGTH: 10,
  INCIDENT_DESCRIPTION_MAX_LENGTH: 1000,
  /** Photos a single incident report may attach. */
  INCIDENT_MAX_PHOTOS: 5,
} as const;

/** Safe Check-In interval choices, in minutes, offered on the screen. */
export const SAFE_CHECKIN_INTERVAL_OPTIONS_MINUTES = [15, 30, 60, 120] as const;

/** Live-location share durations (hours) offered on the Live Location screen. */
export const LIVE_LOCATION_DURATION_OPTIONS_HOURS = [1, 2, 4, 8] as const;

/** ETA presets (minutes) offered on the Safe Journey form. */
export const SAFE_JOURNEY_ETA_PRESETS_MINUTES = [15, 30, 60, 120] as const;

/** Base URL for the shareable location links sent in every SOS / journey SMS. */
export const GOOGLE_MAPS_PLACE_URL = 'https://www.google.com/maps/place';

/**
 * Delay presets (seconds) offered by the fake-call scheduler. `0` means the
 * call rings immediately. Kept out of `APP_CONFIG` because that object is
 * asserted to be entirely numeric.
 */
export const FAKE_CALL_DELAY_OPTIONS_SECONDS = [0, 60, 300] as const;

/** Written into an SMS alert record when a location fix could not be obtained. */
export const LOCATION_UNAVAILABLE = 'Location unavailable';

/** Newest-first cap on the locally persisted SMS alert history. */
export const SMS_HISTORY_LIMIT = 50;

/** Newest-first cap on the locally persisted evidence-recording history. */
export const EVIDENCE_RECORDING_HISTORY_LIMIT = 50;

/**
 * Sentinel for the "show everything" chip in the Information Hub category
 * filters. A string, so it lives outside the numeric `APP_CONFIG` object; its
 * visible label comes from `t('info.allCategories')`.
 */
export const ALL_CATEGORIES = 'all';

/**
 * 4:3 crop the picker applies to an attached community image. Kept out of
 * `APP_CONFIG` because that object is asserted to be entirely numeric.
 */
export const COMMUNITY_IMAGE_ASPECT: [number, number] = [4, 3];
