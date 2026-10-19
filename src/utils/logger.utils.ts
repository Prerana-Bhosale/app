import { sanitizeDiagnostics } from '@/utils/redaction.utils';

export type LogDomain =
  'AUTH' | 'LOCATION' | 'SOS' | 'COMMUNITY' | 'STORAGE' | 'NETWORK' | 'UI' | 'SYSTEM';

export interface LogPayload {
  domain: LogDomain;
  operation: string;
  error?: unknown;
  context?: Record<string, unknown> | undefined;
}

const RADIX_BASE36 = 36;
const INCIDENT_RANDOM_MULTIPLIER = 46656;
const INCIDENT_PAD_LENGTH = 3;

function generateIncidentId(): string {
  const timestamp = Date.now().toString(RADIX_BASE36).toUpperCase();
  const random = Math.floor(Math.random() * INCIDENT_RANDOM_MULTIPLIER)
    .toString(RADIX_BASE36)
    .padStart(INCIDENT_PAD_LENGTH, '0')
    .toUpperCase();
  return `SRK-${timestamp}-${random}`;
}

export const metroLogger = {
  info(message: string, payload: LogPayload): void {
    const sanitizedContext = sanitizeDiagnostics(payload.context);
    console.warn(
      `[SURAKSHAK:INFO] [${payload.domain}:${payload.operation}] ${message}`,
      sanitizedContext ?? '',
    );
  },

  warn(message: string, payload: LogPayload): void {
    const sanitizedContext = sanitizeDiagnostics(payload.context);
    console.warn(
      `[SURAKSHAK:WARN] [${payload.domain}:${payload.operation}] ${message}`,
      sanitizedContext ?? '',
    );
  },

  error(message: string, payload: LogPayload): string {
    const incidentId = generateIncidentId();
    const sanitizedError = sanitizeDiagnostics(payload.error);
    const sanitizedContext = sanitizeDiagnostics(payload.context);

    console.error(
      `[SURAKSHAK ERROR] ${payload.domain} -> ${payload.operation}\n` +
        `  Incident ID: ${incidentId}\n` +
        `  Message: ${message}`,
      sanitizedError,
      sanitizedContext ?? {},
    );

    return incidentId;
  },
};
