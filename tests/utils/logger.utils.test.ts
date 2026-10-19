import { metroLogger } from '@/utils/logger.utils';

describe('metroLogger', () => {
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('formats info logs with domain and operation', () => {
    metroLogger.info('Testing info', {
      domain: 'AUTH',
      operation: 'login',
      context: { user: 'Priya' },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[SURAKSHAK:INFO] [AUTH:login] Testing info'),
      expect.objectContaining({ user: 'Priya' }),
    );
  });

  it('formats warn logs with domain and operation', () => {
    metroLogger.warn('Slow connection', {
      domain: 'NETWORK',
      operation: 'fetchFeed',
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[SURAKSHAK:WARN] [NETWORK:fetchFeed] Slow connection'),
      '',
    );
  });

  it('formats error logs with incident ID and sanitizes error content', () => {
    const incidentId = metroLogger.error('Critical failure', {
      domain: 'SOS',
      operation: 'dispatch',
      error: new Error('Cannot dial +919876543210'),
      context: { token: 'secret-auth-token' },
    });

    expect(incidentId).toMatch(/^SRK-[A-Z0-9]+-[A-Z0-9]+$/);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[SURAKSHAK ERROR] SOS -> dispatch'),
      expect.objectContaining({
        message: expect.stringContaining('[PHONE_REDACTED]'),
      }),
      expect.objectContaining({
        token: '[REDACTED]',
      }),
    );
  });
});
