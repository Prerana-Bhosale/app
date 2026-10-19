import * as Sentry from '@sentry/react-native';

import { ENV, IS_TELEMETRY_ENABLED } from '@/config/env';
import { type LogDomain, metroLogger } from '@/utils/logger.utils';
import { sanitizeDiagnostics } from '@/utils/redaction.utils';

export interface CaptureContext {
  domain?: LogDomain;
  operation?: string;
  extra?: Record<string, unknown>;
}

/**
 * Phone numbers are the single most sensitive field Surakshak handles — an SOS
 * payload carries the user's number and every emergency contact's. Strip
 * anything number-shaped before it leaves the device.
 */
export function scrubPhoneNumbers(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  return sanitizeDiagnostics(event) as Sentry.ErrorEvent;
}

export function initSentry(): void {
  if (!IS_TELEMETRY_ENABLED) {
    return;
  }

  Sentry.init({
    dsn: ENV.SENTRY_DSN,
    environment: ENV.APP_ENV,
    beforeSend: scrubPhoneNumbers,
  });
}

export function captureException(error: unknown, context?: CaptureContext): void {
  const domain = context?.domain ?? 'SYSTEM';
  const operation = context?.operation ?? 'unhandled';

  if (!IS_TELEMETRY_ENABLED) {
    metroLogger.error('Exception captured in dev mode', {
      domain,
      operation,
      error,
      context: context?.extra,
    });
    return;
  }

  Sentry.captureException(error);
}

export function captureMessage(message: string, context?: CaptureContext): void {
  const domain = context?.domain ?? 'SYSTEM';
  const operation = context?.operation ?? 'info';

  if (!IS_TELEMETRY_ENABLED) {
    metroLogger.info(message, {
      domain,
      operation,
      context: context?.extra,
    });
    return;
  }

  Sentry.captureMessage(message);
}
