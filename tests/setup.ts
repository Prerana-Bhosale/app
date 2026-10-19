/**
 * Global Jest setup. Native modules have no JS implementation under Jest, so
 * every package backed by native code is mocked here rather than in each test.
 *
 * Environment variables are NOT set here — `babel-preset-expo` inlines
 * `EXPO_PUBLIC_*` at transform time, which happens before this file runs. They
 * are set at module scope in `jest.config.js` instead.
 *
 * The i18n import runs the real translation stack rather than stubbing `t` to
 * echo its key, so a typo'd translation key fails a screen test instead of
 * silently passing. `jest.mock` calls are hoisted above it by babel-jest, so
 * the mocks below still apply.
 */
import type * as React from 'react';

import '@/i18n';

jest.mock('@react-native-firebase/app', () => ({
  getApp: jest.fn(() => ({ name: '[DEFAULT]' })),
}));

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(() => ({ currentUser: null })),
  onAuthStateChanged: jest.fn(() => jest.fn()),
  signOut: jest.fn(() => Promise.resolve()),
  signInWithPhoneNumber: jest.fn(() => Promise.resolve({ confirm: jest.fn() })),
  deleteUser: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  collection: jest.fn(() => ({})),
  query: jest.fn((ref: unknown) => ref),
  where: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  limit: jest.fn(() => ({})),
  getDoc: jest.fn(() =>
    Promise.resolve({ exists: () => false, id: 'test-uid', data: () => undefined }),
  ),
  getDocs: jest.fn(() => Promise.resolve({ docs: [] })),
  setDoc: jest.fn(() => Promise.resolve()),
  updateDoc: jest.fn(() => Promise.resolve()),
  deleteDoc: jest.fn(() => Promise.resolve()),
  serverTimestamp: jest.fn(() => ({ __serverTimestamp: true })),
}));

jest.mock('expo-file-system', () => {
  class MockFile {
    exists = false;
    text = jest.fn(() => Promise.resolve('{}'));
    write = jest.fn();
    create = jest.fn();
    delete = jest.fn();
  }
  class MockDirectory {
    exists = true;
    create = jest.fn();
  }
  return { File: MockFile, Directory: MockDirectory, Paths: { cache: {} } };
});

jest.mock('@react-native-firebase/storage', () => ({
  getStorage: jest.fn(() => ({})),
  ref: jest.fn(() => ({})),
  putFile: jest.fn(() => Promise.resolve()),
  deleteObject: jest.fn(() => Promise.resolve()),
  getDownloadURL: jest.fn(() => Promise.resolve('https://example.com/avatar.jpg')),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    multiGet: jest.fn(() => Promise.resolve([])),
    multiSet: jest.fn(() => Promise.resolve()),
    multiRemove: jest.fn(() => Promise.resolve()),
    clear: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true })),
}));

// Native permission modules pulled in transitively by `@/utils/permissions.utils`.
jest.mock('expo-audio', () => ({
  requestRecordingPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
}));

jest.mock('expo-camera', () => ({
  Camera: {
    requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
  },
}));

jest.mock('expo-contacts', () => ({
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
}));

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

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
  requestBackgroundPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
  getForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
  getBackgroundPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
  getCurrentPositionAsync: jest.fn(() =>
    Promise.resolve({
      coords: { latitude: 19.076, longitude: 72.8777, accuracy: 5 },
      timestamp: 1_700_000_000_000,
    }),
  ),
  getLastKnownPositionAsync: jest.fn(() => Promise.resolve(null)),
  hasServicesEnabledAsync: jest.fn(() => Promise.resolve(true)),
  watchPositionAsync: jest.fn(() => Promise.resolve({ remove: jest.fn() })),
  startLocationUpdatesAsync: jest.fn(() => Promise.resolve()),
  stopLocationUpdatesAsync: jest.fn(() => Promise.resolve()),
  hasStartedLocationUpdatesAsync: jest.fn(() => Promise.resolve(false)),
  reverseGeocodeAsync: jest.fn(() =>
    Promise.resolve([{ city: 'Mumbai', region: 'Maharashtra', subregion: 'Mumbai' }]),
  ),
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskDefined: jest.fn(() => false),
  isTaskRegisteredAsync: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('react-native-maps', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  const Passthrough = (props: { children?: React.ReactNode }): React.ReactElement =>
    ReactActual.createElement(RN.View, null, props.children);
  const MapView = ReactActual.forwardRef(
    (
      props: { children?: React.ReactNode; onPanDrag?: () => void },
      ref: React.ForwardedRef<{
        animateToRegion: jest.Mock;
        animateCamera: jest.Mock;
      }>,
    ): React.ReactElement => {
      ReactActual.useImperativeHandle(ref, () => ({
        animateToRegion: jest.fn(),
        animateCamera: jest.fn(),
      }));
      return ReactActual.createElement(RN.View, { onTouchMove: props.onPanDrag }, props.children);
    },
  );
  // Pressable so a test can tap a pin by its testID.
  const Marker = (props: {
    children?: React.ReactNode;
    onPress?: () => void;
    testID?: string;
  }): React.ReactElement =>
    ReactActual.createElement(
      RN.Pressable,
      { onPress: props.onPress, testID: props.testID },
      props.children,
    );
  return {
    __esModule: true,
    default: MapView,
    Marker,
    Circle: Passthrough,
    PROVIDER_GOOGLE: 'google',
  };
});

jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notification-1')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  dismissNotificationAsync: jest.fn(() => Promise.resolve()),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
  AndroidImportance: { LOW: 2 },
}));

// `SafeAreaView`/`SafeAreaProvider` already worked under jest-expo's automock
// (NativeWind's css-interop wraps the real component and needs its real
// displayName, so the module can't be swapped wholesale) — but
// `useSafeAreaInsets()` (now used by BottomSheet and map.tsx) throws without
// a real `<SafeAreaProvider>` ancestor, which no screen test renders. Only
// the hook is stubbed, to zeroed insets matching the library's own
// MOCK_INITIAL_METRICS default.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: jest.fn(() => ({ top: 0, right: 0, bottom: 0, left: 0 })),
}));

jest.mock('expo-updates', () => ({
  isEnabled: false,
  isEmbeddedLaunch: true,
  updateId: null,
  channel: null,
  runtimeVersion: null,
  checkForUpdateAsync: jest.fn(() => Promise.resolve({ isAvailable: false })),
  fetchUpdateAsync: jest.fn(() => Promise.resolve({ isNew: false, manifest: undefined })),
  reloadAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-onesignal', () => ({
  OneSignal: {
    initialize: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
    Notifications: { requestPermission: jest.fn(() => Promise.resolve(true)) },
  },
}));

jest.mock('mixpanel-react-native', () => ({
  Mixpanel: jest.fn().mockImplementation(() => ({
    init: jest.fn(() => Promise.resolve()),
    track: jest.fn(),
    identify: jest.fn(() => Promise.resolve()),
    reset: jest.fn(),
  })),
}));

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: jest.fn((component: unknown) => component),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en', languageTag: 'en-IN' }]),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Warning: 'warning', Success: 'success', Error: 'error' },
}));

// Local Expo module (`modules/surakshak-native`) — not built under Jest (no
// `build/index.js`), and its native side has no JS implementation anyway.
jest.mock('surakshak-native', () => ({
  sendSmsDirect: jest.fn(() =>
    Promise.resolve({ success: true, phone: '', method: 'direct' as const }),
  ),
  sendSmsToContacts: jest.fn((phones: string[]) =>
    Promise.resolve(phones.map((phone) => ({ success: true, phone, method: 'direct' as const }))),
  ),
  checkSmsPermission: jest.fn(() => Promise.resolve(true)),
  setProximityScreenOff: jest.fn(() => Promise.resolve()),
  setAppIcon: jest.fn(() => Promise.resolve()),
  placeCallDirectly: jest.fn((phone: string) =>
    Promise.resolve({ success: true, phone, method: 'direct' as const }),
  ),
}));

jest.mock('@expo-google-fonts/noto-sans-devanagari', () => ({
  useFonts: jest.fn(() => [true]),
  NotoSansDevanagari_400Regular: 'NotoSansDevanagari_400Regular',
  NotoSansDevanagari_600SemiBold: 'NotoSansDevanagari_600SemiBold',
  NotoSansDevanagari_700Bold: 'NotoSansDevanagari_700Bold',
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useSegments: () => [],
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));
