import { sanitizeDiagnostics } from '@/utils/redaction.utils';

describe('sanitizeDiagnostics', () => {
  it('returns primitive non-string values as-is', () => {
    expect(sanitizeDiagnostics(123)).toBe(123);
    expect(sanitizeDiagnostics(true)).toBe(true);
    expect(sanitizeDiagnostics(null)).toBeNull();
    expect(sanitizeDiagnostics(undefined)).toBeUndefined();
  });

  it('redacts 10-digit Indian mobile numbers in strings', () => {
    const sanitized = sanitizeDiagnostics('Emergency contact: 9876543210');
    expect(sanitized).toBe('Emergency contact: [PHONE_REDACTED]');
  });

  it('redacts +91 prefixed Indian mobile numbers', () => {
    const sanitized = sanitizeDiagnostics('Calling +919876543210');
    expect(sanitized).toBe('Calling [PHONE_REDACTED]');
  });

  it('preserves official emergency helpline numbers', () => {
    const sanitized = sanitizeDiagnostics('Dial 112 or 100 or 108 or 1091');
    expect(sanitized).toBe('Dial 112 or 100 or 108 or 1091');
  });

  it('redacts sensitive object keys', () => {
    const payload = {
      name: 'Priya',
      token: 'secret-token-123',
      password: 'mypassword',
      pin: '1234',
      otp: '654321',
      latitude: 19.076,
      longitude: 72.877,
      safeField: 'visible',
    };
    const sanitized = sanitizeDiagnostics(payload) as Record<string, unknown>;
    expect(sanitized.token).toBe('[REDACTED]');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.pin).toBe('[REDACTED]');
    expect(sanitized.otp).toBe('[REDACTED]');
    expect(sanitized.latitude).toBe('[REDACTED]');
    expect(sanitized.longitude).toBe('[REDACTED]');
    expect(sanitized.safeField).toBe('visible');
  });

  it('handles circular object structures safely without crashing', () => {
    const circular: Record<string, unknown> = { name: 'circular-test' };
    circular.self = circular;

    expect(() => sanitizeDiagnostics(circular)).not.toThrow();
    const result = sanitizeDiagnostics(circular) as Record<string, unknown>;
    expect(result.self).toBe('[CIRCULAR]');
  });

  it('sanitizes Error instances preserving name and stack', () => {
    const err = new Error('Failed at +919876543210');
    const result = sanitizeDiagnostics(err) as { name: string; message: string; stack?: string };
    expect(result.name).toBe('Error');
    expect(result.message).toBe('Failed at [PHONE_REDACTED]');
    expect(result.stack).toBeDefined();
  });
});
