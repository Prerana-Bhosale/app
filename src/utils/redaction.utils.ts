const SENSITIVE_KEYS = new Set([
  'password',
  'pin',
  'otp',
  'token',
  'idtoken',
  'authtoken',
  'authorization',
  'secret',
  'bearer',
  'coords',
  'coordinates',
  'latitude',
  'longitude',
]);

const INDIAN_PHONE_REGEX = /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g;
const GENERIC_PHONE_REGEX = /\b\d{10,12}\b/g;
const PRESERVED_EMERGENCY_NUMBERS = new Set(['112', '100', '108', '102', '181', '1091', '1098']);

/**
 * Recursively sanitizes objects and strings for diagnostic logging.
 * Redacts phone numbers, passwords, tokens, and coordinates while handling circular references.
 */
export function sanitizeDiagnostics(target: unknown, seen = new WeakSet<object>()): unknown {
  if (target === null || target === undefined) {
    return target;
  }

  if (typeof target === 'string') {
    return target
      .replace(INDIAN_PHONE_REGEX, '[PHONE_REDACTED]')
      .replace(GENERIC_PHONE_REGEX, (match) => {
        if (PRESERVED_EMERGENCY_NUMBERS.has(match)) {
          return match;
        }
        return '[PHONE_REDACTED]';
      });
  }

  if (typeof target !== 'object') {
    return target;
  }

  if (seen.has(target)) {
    return '[CIRCULAR]';
  }
  seen.add(target);

  if (target instanceof Error) {
    return {
      name: target.name,
      message: sanitizeDiagnostics(target.message, seen),
      stack: target.stack,
    };
  }

  if (Array.isArray(target)) {
    return target.map((item: unknown) => sanitizeDiagnostics(item, seen));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(target)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeDiagnostics(value, seen);
    }
  }

  return sanitized;
}
