import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook } from '@testing-library/react-native';
import * as Battery from 'expo-battery';

import { useBatteryAlert } from '@/hooks/useBatteryAlert';
import { useUserStore } from '@/stores/user.store';

jest.mock('expo-battery', () => ({
  getBatteryLevelAsync: jest.fn(() => Promise.resolve(1)),
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
  Promise.resolve({ sent: [], failed: [] }),
);

jest.mock('@/services/sms.service', () => ({
  sendLowBatteryAlert: (...args: unknown[]) => mockSendLowBatteryAlert(...args),
  recordSMSAlert: jest.fn(() => Promise.resolve({ id: 'r1' })),
}));
jest.mock('@/services/location.service', () => ({
  getCurrentLocation: jest.fn(() => Promise.reject(new Error('no fix'))),
  buildLocationUrl: jest.fn(() => 'url'),
}));
jest.mock('@/services/analytics.service', () => ({ trackLowBatteryAlertSent: jest.fn() }));

const CONTACT = {
  id: 'c1',
  name: 'Ma',
  phone: '+919876543210',
  relationship: 'Mother',
  isPredefined: false,
  order: 0,
};

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('useBatteryAlert — guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useUserStore.setState({ emergencyContacts: [CONTACT] });
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    jest.mocked(Battery.getBatteryLevelAsync).mockResolvedValue(1);
    jest.mocked(Battery.getBatteryStateAsync).mockResolvedValue(Battery.BatteryState.UNPLUGGED);
  });

  it('does not fire when the low-battery flag is turned off', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue('false');
    jest.mocked(Battery.getBatteryLevelAsync).mockResolvedValue(0.05);

    await renderHook(() => useBatteryAlert());
    await flush();
    await flush();

    expect(mockSendLowBatteryAlert).not.toHaveBeenCalled();
    expect(Battery.addBatteryLevelListener).not.toHaveBeenCalled();
  });

  it('does not fire while the battery is above the threshold', async () => {
    jest.mocked(Battery.getBatteryLevelAsync).mockResolvedValue(0.8);

    await renderHook(() => useBatteryAlert());
    await flush();
    await flush();

    expect(mockSendLowBatteryAlert).not.toHaveBeenCalled();
  });

  it('does not fire while the battery is charging', async () => {
    jest.mocked(Battery.getBatteryLevelAsync).mockResolvedValue(0.05);
    jest.mocked(Battery.getBatteryStateAsync).mockResolvedValue(Battery.BatteryState.CHARGING);

    await renderHook(() => useBatteryAlert());
    await flush();
    await flush();

    expect(mockSendLowBatteryAlert).not.toHaveBeenCalled();
  });

  it('does not fire when there are no emergency contacts (runs last — arms the session flag)', async () => {
    useUserStore.setState({ emergencyContacts: [] });
    jest.mocked(Battery.getBatteryLevelAsync).mockResolvedValue(0.05);

    await renderHook(() => useBatteryAlert());
    await flush();
    await flush();

    expect(mockSendLowBatteryAlert).not.toHaveBeenCalled();
  });
});
