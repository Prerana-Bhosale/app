import { Mixpanel } from 'mixpanel-react-native';

import { ENV, IS_TELEMETRY_ENABLED } from '@/config/env';

let mixpanelInstance: Mixpanel | null = null;

export async function initMixPanel(): Promise<void> {
  if (!IS_TELEMETRY_ENABLED) {
    return;
  }

  try {
    const instance = new Mixpanel(ENV.MIXPANEL_TOKEN, true);
    await instance.init();
    mixpanelInstance = instance;
  } catch (error) {
    console.error('initMixPanel failed:', error);
  }
}

export function track(event: string, properties?: Record<string, unknown>): void {
  if (!IS_TELEMETRY_ENABLED || !mixpanelInstance) return;
  mixpanelInstance.track(event, properties);
}

export function identify(userId: string): void {
  if (!IS_TELEMETRY_ENABLED || !mixpanelInstance) return;
  void mixpanelInstance.identify(userId);
}

export function resetAnalytics(): void {
  if (!IS_TELEMETRY_ENABLED || !mixpanelInstance) return;
  mixpanelInstance.reset();
}
