import type { Language } from '@/types/user.types';

/**
 * SMS goes out over the device SIM with no delivery guarantee and a hard
 * 160-character-per-segment budget, so these stay short and lead with the
 * location link — the one piece a recipient acts on first. No emoji: a single
 * one forces the whole message into UCS-2, shrinking each segment to 70
 * characters and multiplying the parts a weak signal has to carry.
 *
 * Messages are built as raw strings rather than through i18next: SMS is sent
 * regardless of whether the on-screen catalogues are fully loaded, and an
 * emergency alert must be readable in the sender's language immediately.
 */
interface SOSTemplateInput {
  name: string;
  locationUrl: string;
  time: string;
}

interface LowBatteryTemplateInput {
  name: string;
  locationUrl: string;
}

interface SafeJourneyTemplateInput {
  name: string;
  destination: string;
  etaTime: string;
  locationUrl: string;
}

interface SafeJourneyStartTemplateInput {
  name: string;
  destination: string;
  etaTime: string;
  locationUrl: string;
}

interface SafeJourneyEtaExtendedTemplateInput {
  name: string;
  destination: string;
  newEtaTime: string;
}

interface LiveLocationTemplateInput {
  name: string;
  locationUrl: string;
  untilTime: string;
}

interface CheckInMissedTemplateInput {
  name: string;
  locationUrl: string;
}

const SOS_TEMPLATES: Record<Language, (input: SOSTemplateInput) => string> = {
  en: ({ name, locationUrl, time }) =>
    `SOS EMERGENCY ALERT from ${name}. I need help immediately.\n` +
    `My location: ${locationUrl}\n` +
    `Time: ${time}\n` +
    `— Sent via Surakshak (Har Kadam, Surakshit)`,
  hi: ({ name, locationUrl, time }) =>
    `SOS आपातकालीन सूचना: ${name} को तुरंत मदद चाहिए।\n` +
    `स्थान: ${locationUrl}\n` +
    `समय: ${time}\n` +
    `— सुरक्षक ऐप द्वारा भेजा गया`,
  mr: ({ name, locationUrl, time }) =>
    `SOS तातडीची सूचना: ${name} ला तातडीने मदत हवी आहे।\n` +
    `स्थान: ${locationUrl}\n` +
    `वेळ: ${time}\n` +
    `— सुरक्षक अ‍ॅपद्वारे पाठवले`,
};

const LOW_BATTERY_TEMPLATES: Record<Language, (input: LowBatteryTemplateInput) => string> = {
  en: ({ name, locationUrl }) =>
    `${name}'s phone battery is critically low (20%).\n` +
    `She may become unreachable soon.\n` +
    `Last known location: ${locationUrl}\n` +
    `— Surakshak`,
  hi: ({ name, locationUrl }) =>
    `${name} के फोन की बैटरी बहुत कम (20%) है।\n` +
    `वो जल्द ही संपर्क से बाहर हो सकती हैं।\n` +
    `अंतिम स्थान: ${locationUrl}\n` +
    `— सुरक्षक`,
  mr: ({ name, locationUrl }) =>
    `${name} च्या फोनची बॅटरी खूप कमी (20%) आहे।\n` +
    `त्या लवकरच संपर्काबाहेर जाऊ शकतात।\n` +
    `शेवटचे स्थान: ${locationUrl}\n` +
    `— सुरक्षक`,
};

const SAFE_JOURNEY_TEMPLATES: Record<Language, (input: SafeJourneyTemplateInput) => string> = {
  en: ({ name, destination, etaTime, locationUrl }) =>
    `${name} has not checked in for her journey to ${destination}.\n` +
    `She was expected to arrive by ${etaTime}.\n` +
    `Last known location: ${locationUrl}\n` +
    `Please check on her immediately.\n` +
    `— Surakshak`,
  hi: ({ name, destination, etaTime, locationUrl }) =>
    `${name} ने ${destination} की यात्रा के लिए चेक-इन नहीं किया।\n` +
    `उन्हें ${etaTime} तक पहुँचना था।\n` +
    `अंतिम स्थान: ${locationUrl}\n` +
    `कृपया उनसे तुरंत संपर्क करें।\n` +
    `— सुरक्षक`,
  mr: ({ name, destination, etaTime, locationUrl }) =>
    `${name} ने ${destination} च्या प्रवासासाठी चेक-इन केले नाही।\n` +
    `त्यांना ${etaTime} पर्यंत पोहोचायचे होते।\n` +
    `शेवटचे स्थान: ${locationUrl}\n` +
    `कृपया त्यांच्याशी तातडीने संपर्क साधा।\n` +
    `— सुरक्षक`,
};

// Informational, not an alarm: sent when a journey starts so contacts know
// to expect the overdue warning only if she doesn't arrive (BUG-028).
const SAFE_JOURNEY_START_TEMPLATES: Record<
  Language,
  (input: SafeJourneyStartTemplateInput) => string
> = {
  en: ({ name, destination, etaTime, locationUrl }) =>
    `${name} has started a journey to ${destination} and expects to arrive by ${etaTime}.\n` +
    `You will be alerted if she does not check in.\n` +
    `Starting point: ${locationUrl}\n` +
    `— Surakshak`,
  hi: ({ name, destination, etaTime, locationUrl }) =>
    `${name} ने ${destination} की यात्रा शुरू की है और ${etaTime} तक पहुँचने की उम्मीद है।\n` +
    `अगर वे चेक-इन नहीं करतीं, तो आपको सूचित किया जाएगा।\n` +
    `शुरुआती स्थान: ${locationUrl}\n` +
    `— सुरक्षक`,
  mr: ({ name, destination, etaTime, locationUrl }) =>
    `${name} ने ${destination} चा प्रवास सुरू केला आहे आणि ${etaTime} पर्यंत पोहोचण्याची अपेक्षा आहे.\n` +
    `त्यांनी चेक-इन न केल्यास तुम्हाला कळवले जाईल.\n` +
    `सुरुवातीचे स्थान: ${locationUrl}\n` +
    `— सुरक्षक`,
};

const SAFE_JOURNEY_ETA_EXTENDED_TEMPLATES: Record<
  Language,
  (input: SafeJourneyEtaExtendedTemplateInput) => string
> = {
  en: ({ name, destination, newEtaTime }) =>
    `${name} has extended her expected arrival time for the journey to ${destination}.\n` +
    `New expected arrival: ${newEtaTime}.\n` +
    `— Surakshak`,
  hi: ({ name, destination, newEtaTime }) =>
    `${name} ने ${destination} की यात्रा के लिए अपने पहुँचने का समय बढ़ाया है।\n` +
    `नया अनुमानित समय: ${newEtaTime}।\n` +
    `— सुरक्षक`,
  mr: ({ name, destination, newEtaTime }) =>
    `${name} ने ${destination} च्या प्रवासासाठी पोहोचण्याची वेळ वाढवली आहे.\n` +
    `नवीन पोहोचण्याची वेळ: ${newEtaTime}.\n` +
    `— सुरक्षक`,
};

// Routine sharing, not an emergency (BUG-026).
const LIVE_LOCATION_TEMPLATES: Record<Language, (input: LiveLocationTemplateInput) => string> = {
  en: ({ name, locationUrl, untilTime }) =>
    `${name} is sharing her location with you until ${untilTime}.\n` +
    `Location: ${locationUrl}\n` +
    `— Surakshak`,
  hi: ({ name, locationUrl, untilTime }) =>
    `${name} ${untilTime} तक आपके साथ अपना स्थान साझा कर रही हैं।\n` +
    `स्थान: ${locationUrl}\n` +
    `— सुरक्षक`,
  mr: ({ name, locationUrl, untilTime }) =>
    `${name} ${untilTime} पर्यंत तुमच्यासोबत त्यांचे स्थान शेअर करत आहेत.\n` +
    `स्थान: ${locationUrl}\n` +
    `— सुरक्षक`,
};

const CHECKIN_MISSED_TEMPLATES: Record<Language, (input: CheckInMissedTemplateInput) => string> = {
  en: ({ name, locationUrl }) =>
    `${name} has missed her Safe Check-In and could not be reached.\n` +
    `Last known location: ${locationUrl}\n` +
    `Please check on her immediately.\n` +
    `— Surakshak`,
  hi: ({ name, locationUrl }) =>
    `${name} ने अपना सुरक्षित चेक-इन नहीं किया और उनसे संपर्क नहीं हो पाया।\n` +
    `अंतिम स्थान: ${locationUrl}\n` +
    `कृपया उनसे तुरंत संपर्क करें।\n` +
    `— सुरक्षक`,
  mr: ({ name, locationUrl }) =>
    `${name} ने सुरक्षित चेक-इन केले नाही आणि त्यांच्याशी संपर्क होऊ शकला नाही।\n` +
    `शेवटचे स्थान: ${locationUrl}\n` +
    `कृपया त्यांच्याशी तातडीने संपर्क साधा।\n` +
    `— सुरक्षक`,
};

export function buildSOSMessage(name: string, locationUrl: string, language: Language): string {
  // 'en-IN' keeps the timestamp in ASCII digits regardless of the app's
  // selected language or the device's own locale — Devanagari numerals
  // (e.g. from a hi-IN/mr-IN device default) are never acceptable here.
  return SOS_TEMPLATES[language]({
    name,
    locationUrl,
    time: new Date().toLocaleString('en-IN'),
  });
}

export function buildLowBatteryMessage(
  name: string,
  locationUrl: string,
  language: Language,
): string {
  return LOW_BATTERY_TEMPLATES[language]({ name, locationUrl });
}

export function buildSafeJourneyMessage(
  name: string,
  destination: string,
  etaTime: string,
  locationUrl: string,
  language: Language,
): string {
  return SAFE_JOURNEY_TEMPLATES[language]({ name, destination, etaTime, locationUrl });
}

export function buildSafeJourneyStartMessage(
  name: string,
  destination: string,
  etaTime: string,
  locationUrl: string,
  language: Language,
): string {
  return SAFE_JOURNEY_START_TEMPLATES[language]({ name, destination, etaTime, locationUrl });
}

export function buildSafeJourneyEtaExtendedMessage(
  name: string,
  destination: string,
  newEtaTime: string,
  language: Language,
): string {
  return SAFE_JOURNEY_ETA_EXTENDED_TEMPLATES[language]({ name, destination, newEtaTime });
}

export function buildLiveLocationMessage(
  name: string,
  locationUrl: string,
  untilTime: string,
  language: Language,
): string {
  return LIVE_LOCATION_TEMPLATES[language]({ name, locationUrl, untilTime });
}

export function buildCheckInMissedMessage(
  name: string,
  locationUrl: string,
  language: Language,
): string {
  return CHECKIN_MISSED_TEMPLATES[language]({ name, locationUrl });
}
