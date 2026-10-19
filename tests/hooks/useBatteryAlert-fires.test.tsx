import { renderHook } from '@testing-library/react-native';
import * as Battery from 'expo-battery';

import { useBatteryAlert } from '@/hooks/useBatteryAlert';
import { useUserStore } from '@/stores/user.store';

jest.mock('expo-battery', () => ({
  getBatteryLevelAsync: jest.fn(() => Promise.resolve(0.15)),
  getBatteryStateAsync: jest.fn(() => Promise.resolve(1)),
  addBatteryLevelListener: jest.fn(() => ({ remove: jest.fn() })),
  BatteryState: {
    UNKNOWN: 0,
    UNPLUGGED: 1,
    CHARGING: 2,
    FULL: 3,
  },
}));

const mockSendLowBatteryAlert = jest.fn((..._args: unknown[]) =>
  Promise.resolve({ sent: ['+91'], failed: [] }),
);
const mockRecordSMSAlert = jest.fn((..._args: unknown[]) => Promise.resolve({ id: 'r1' }));

jest.mock('@/services/sms.service', () => ({
  sendLowBatteryAlert: (...args: unknown[]) => mockSendLowBatteryAlert(...args),
  recordSMSAlert: (...args: unknown[]) => mockRecordSMSAlert(...args),
}));
jest.mock('@/services/location.service', () => ({
  getCurrentLocation: jest.fn(() => Promise.reject(new Error('no fix'))),
  buildLocationUrl: jest.fn(() => 'url'),
}));
jest.mock('@/services/analytics.service', () => ({ trackLowBatteryAlertSent: jest.fn() }));

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// This file exercises the one path that arms the module-level "once per session"
// flag, so it is kept on its own — Jest gives each test file a fresh registry.
describe('useBatteryAlert — firing path', () => {
  it('sends the alert exactly once when the battery drops to the threshold', async () => {
    useUserStore.setState({
      emergencyContacts: [
        {
          id: 'c1',
          name: 'Ma',
          phone: '+919876543210',
          relationship: 'Mother',
          isPredefined: false,
          order: 0,
        },
      ],
    });

    await renderHook(() => useBatteryAlert());
    await flush();
    await flush();

    expect(mockSendLowBatteryAlert).toHaveBeenCalledTimes(1);
    expect(mockRecordSMSAlert).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'low_battery' }),
    );

    const listener = jest.mocked(Battery.addBatteryLevelListener).mock.calls[0]?.[0];
    listener?.({ batteryLevel: 0.05 });
    await flush();

    expect(mockSendLowBatteryAlert).toHaveBeenCalledTimes(1);
  });
});
