import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';
import { getFunctions } from '@react-native-firebase/functions';
import { getStorage } from '@react-native-firebase/storage';

/**
 * `@react-native-firebase` auto-initialises the default app from the native
 * config files bundled at build time (`google-services.json` on Android,
 * `GoogleService-Info.plist` on iOS), so there is nothing to configure here —
 * which project you get is decided by `app.config.ts` from APP_ENV.
 *
 * Offline persistence: RNFirebase's native Firestore SDKs cache reads and
 * queue writes locally by default — unlike the Firestore Web SDK, there is no
 * opt-in call needed and no namespaced `firestore().settings(...)` API exists
 * against the modular functions used below. This means laws, FAQs, community
 * posts and unsafe areas all keep working offline after their first load, and
 * an SOS-adjacent Firestore write (e.g. a live-location session) queues and
 * sends once connectivity returns, without any code here to do it.
 */
const app = getApp();

export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const functions = getFunctions(app, 'asia-south1');
export const storage = getStorage(app);
