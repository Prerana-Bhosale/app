import type { Language } from '@/types/user.types';
import {
  buildLiveLocationMessage,
  buildLowBatteryMessage,
  buildSafeJourneyMessage,
  buildSafeJourneyStartMessage,
  buildSafeJourneyEtaExtendedMessage,
  buildSOSMessage,
} from '@/utils/sms.utils';

const LOCATION_URL = 'https://www.google.com/maps/place/19.076,72.8777';
const LANGUAGES: readonly Language[] = ['en', 'hi', 'mr'];

describe('buildSOSMessage', () => {
  it('names the user and carries the location link (en)', () => {
    const message = buildSOSMessage('Priya', LOCATION_URL, 'en');
    expect(message).toContain('Priya');
    expect(message).toContain(LOCATION_URL);
    expect(message).toContain('EMERGENCY');
  });

  it.each(LANGUAGES)('returns a non-empty localized message with the link for %s', (language) => {
    const message = buildSOSMessage('Priya', LOCATION_URL, language);
    expect(message.length).toBeGreaterThan(0);
    expect(message).toContain('Priya');
    expect(message).toContain(LOCATION_URL);
  });

  it('uses distinct copy for hi and mr (not the English string)', () => {
    const en = buildSOSMessage('Priya', LOCATION_URL, 'en');
    expect(buildSOSMessage('Priya', LOCATION_URL, 'hi')).not.toBe(en);
    expect(buildSOSMessage('Priya', LOCATION_URL, 'mr')).not.toBe(en);
  });

  it.each(LANGUAGES)(
    'renders the timestamp in ASCII digits regardless of language (%s)',
    (language) => {
      const message = buildSOSMessage('Priya', LOCATION_URL, language);
      // Devanagari numerals (०-९) must never appear — emergency numbers/times stay ASCII.
      expect(message).not.toMatch(/[०-९]/u);
    },
  );
});

describe('buildLowBatteryMessage', () => {
  it.each(LANGUAGES)('names the user and carries the location link for %s', (language) => {
    const message = buildLowBatteryMessage('Priya', LOCATION_URL, language);
    expect(message.length).toBeGreaterThan(0);
    expect(message).toContain('Priya');
    expect(message).toContain(LOCATION_URL);
  });
});

describe('buildSafeJourneyMessage', () => {
  it.each(LANGUAGES)('names the destination, arrival time and location link for %s', (language) => {
    const message = buildSafeJourneyMessage(
      'Priya',
      'Andheri Station',
      '3:30 PM',
      LOCATION_URL,
      language,
    );
    expect(message).toContain('Priya');
    expect(message).toContain('Andheri Station');
    expect(message).toContain('3:30 PM');
    expect(message).toContain(LOCATION_URL);
  });
});

describe('buildSafeJourneyStartMessage', () => {
  it.each(LANGUAGES)('is informational, not an overdue warning (%s)', (language) => {
    const message = buildSafeJourneyStartMessage(
      'Priya',
      'Andheri',
      '6:30 PM',
      LOCATION_URL,
      language,
    );
    expect(message).toContain('Priya');
    expect(message).toContain('Andheri');
    expect(message).toContain('6:30 PM');
    expect(message).toContain(LOCATION_URL);
    expect(message).not.toBe(
      buildSafeJourneyMessage('Priya', 'Andheri', '6:30 PM', LOCATION_URL, language),
    );
  });

  it('does not tell contacts to check on her (en)', () => {
    expect(
      buildSafeJourneyStartMessage('Priya', 'Andheri', '6:30 PM', LOCATION_URL, 'en'),
    ).not.toMatch(/has not checked in|immediately/);
  });
});

describe('buildSafeJourneyEtaExtendedMessage', () => {
  it.each(LANGUAGES)('notifies contacts of the new expected arrival time (%s)', (language) => {
    const message = buildSafeJourneyEtaExtendedMessage('Priya', 'Andheri', '7:00 PM', language);
    expect(message).toContain('Priya');
    expect(message).toContain('Andheri');
    expect(message).toContain('7:00 PM');
  });
});

describe('buildLiveLocationMessage', () => {
  it.each(LANGUAGES)('shares the link and end time without an SOS (%s)', (language) => {
    const message = buildLiveLocationMessage('Priya', LOCATION_URL, '9:00 PM', language);
    expect(message).toContain(LOCATION_URL);
    expect(message).toContain('9:00 PM');
    expect(message).not.toMatch(/SOS|EMERGENCY/);
  });
});

describe('templates', () => {
  it.each(LANGUAGES)('contain no emoji, which would force UCS-2 segments (%s)', (language) => {
    const messages = [
      buildSOSMessage('Priya', LOCATION_URL, language),
      buildLowBatteryMessage('Priya', LOCATION_URL, language),
      buildSafeJourneyMessage('Priya', 'Andheri', '6:30 PM', LOCATION_URL, language),
      buildSafeJourneyStartMessage('Priya', 'Andheri', '6:30 PM', LOCATION_URL, language),
      buildSafeJourneyEtaExtendedMessage('Priya', 'Andheri', '7:00 PM', language),
      buildLiveLocationMessage('Priya', LOCATION_URL, '9:00 PM', language),
    ];
    for (const message of messages) {
      expect(message).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
