import {
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_600SemiBold,
  NotoSansDevanagari_700Bold,
  useFonts,
} from '@expo-google-fonts/noto-sans-devanagari';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AppState, LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/global.css';

import { GlobalSOSOverlay } from '@/components/features/sos/GlobalSOSOverlay';
import { Spinner } from '@/components/ui/Spinner';
import { initMixPanel } from '@/config/mixpanel';
import { initOneSignal } from '@/config/onesignal';
import { captureException, initSentry } from '@/config/sentry';
import { ROUTES } from '@/constants/routes';
import { STORAGE_KEYS } from '@/constants/storage';
import { useDisguiseGate } from '@/hooks/useDisguiseGate';
import { registerLiveLocationTask } from '@/hooks/useLiveLocation';
import { useSafeJourneyMonitor } from '@/hooks/useSafeJourneyMonitor';
import { useTheme } from '@/hooks/useTheme';
import { changeLanguage } from '@/i18n';
import { identifyUser } from '@/services/analytics.service';
import { subscribeToAuthChanges } from '@/services/firebase/auth.service';
import { getEmergencyContacts, getUserProfile } from '@/services/firebase/user.service';
import { registerForPushNotifications } from '@/services/notification.service';
import { flushPendingOutbox } from '@/services/sms.service';
import { useAuthStore } from '@/stores/auth.store';
import { useDisguiseStore } from '@/stores/disguise.store';
import { useSOSStore } from '@/stores/sos.store';
import { useUserStore } from '@/stores/user.store';
import { installGlobalErrorHandler } from '@/utils/global-error-handler.utils';
import { cacheUserInfo } from '@/utils/offline-cache.utils';

const AUTH_SEGMENT = '(auth)';
const ONBOARDING_SEGMENT = 'onboarding';
const DISGUISE_SEGMENT = '(disguise)';

// The background location task must be defined before the first tick so the
// OS can hand a relaunch back to it — see `useLiveLocation`.
registerLiveLocationTask();

// Suppress React Native dev client LogBox notification bars from rendering at the
// bottom of the viewport on physical devices and emulators. Real errors still route
// to Metro terminal, console, Sentry, and screen ErrorBoundaries.
LogBox.ignoreAllLogs(true);

function RootLayout(): React.JSX.Element {
  const router = useRouter();
  const segments = useSegments();
  const { t } = useTranslation();
  const { isDark } = useTheme();

  // Android has no guaranteed system Devanagari face on every OEM/OS build —
  // load Noto Sans Devanagari so hi/mr text never renders as boxes/tofu.
  // iOS's system font already covers Devanagari, but useFonts still resolves
  // (near-)instantly there since it isn't rendering the glyphs itself.
  const [fontsLoaded] = useFonts({
    NotoSansDevanagari_400Regular,
    NotoSansDevanagari_600SemiBold,
    NotoSansDevanagari_700Bold,
  });

  const user = useAuthStore((state) => state.user);
  const isGuest = useAuthStore((state) => state.isGuest);
  useSafeJourneyMonitor(user !== null && !isGuest ? user.uid : null);
  const isGuestSigningIn = useAuthStore((state) => state.isGuestSigningIn);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const setUser = useAuthStore((state) => state.setUser);
  const setGuest = useAuthStore((state) => state.setGuest);
  const setGuestSigningIn = useAuthStore((state) => state.setGuestSigningIn);
  const setSurakshakUser = useAuthStore((state) => state.setSurakshakUser);
  const setInitialized = useAuthStore((state) => state.setInitialized);
  const setProfileMirror = useUserStore((state) => state.setProfile);
  const setEmergencyContacts = useUserStore((state) => state.setEmergencyContacts);

  // Third-party SDKs. Each one no-ops or warns when APP_ENV is dev.
  useEffect(() => {
    initSentry();
    initOneSignal();
    void initMixPanel();
  }, []);

  // Reports otherwise-unhandled JS errors (thrown outside any try/catch this
  // app owns) to Sentry before falling through to RN's own default handler.
  useEffect(() => installGlobalErrorHandler(captureException), []);

  // Resilient outbox: when app foregrounds or user returns from settings,
  // check if SEND_SMS permission was granted and flush queued emergency alerts.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void flushPendingOutbox();
      }
    });
    return (): void => sub.remove();
  }, []);

  // Firebase auth is reached through the service layer — absolute rule 13
  // forbids a screen (this file included) from touching Firebase directly.
  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((firebaseUser) => {
      async function sync(): Promise<void> {
        try {
          if (firebaseUser !== null) {
            setUser(firebaseUser);
            setGuest(false);
            setGuestSigningIn(false);

            const profile = await getUserProfile(firebaseUser.uid);
            if (profile !== null) {
              setSurakshakUser(profile);
              setProfileMirror(profile);
              identifyUser(firebaseUser.uid);
              await registerForPushNotifications(firebaseUser.uid).catch((pushError: unknown) => {
                captureException(pushError);
              });
              await changeLanguage(profile.language);
              // Offline fallback for the SOS/battery-alert fan-out — see
              // `src/utils/offline-cache.utils.ts`.
              await cacheUserInfo({
                userId: firebaseUser.uid,
                name: profile.name,
                language: profile.language,
              });

              // Emergency contacts otherwise only ever load lazily when the
              // Emergency Contacts screen itself mounts — every other
              // consumer (SOS fan-out, low-battery alert, safe check-in,
              // silent-recording share) reads this same store synchronously
              // via getState() and would silently see an empty list until
              // that screen happened to be visited once this session.
              const contacts = await getEmergencyContacts(firebaseUser.uid);
              setEmergencyContacts(contacts);
            }

            const onboardingDone = await AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE);
            if (profile === null && onboardingDone === null) {
              router.replace(ROUTES.ONBOARDING);
            }
          } else if (!useAuthStore.getState().isGuest) {
            setUser(null);
            setSurakshakUser(null);
          }
        } catch (error) {
          captureException(error);
        } finally {
          setInitialized(true);
        }
      }

      void sync();
    });

    return unsubscribe;
  }, [
    router,
    setUser,
    setGuest,
    setGuestSigningIn,
    setSurakshakUser,
    setProfileMirror,
    setEmergencyContacts,
    setInitialized,
  ]);

  useEffect(() => {
    if (!isInitialized) return;

    const isSignedIn = user !== null || isGuest;
    const isInAuthGroup = segments[0] === AUTH_SEGMENT;
    const isOnboarding = segments.some((segment) => segment === ONBOARDING_SEGMENT);

    if (!isSignedIn && !isInAuthGroup) {
      router.replace(ROUTES.WELCOME);
      // A guest reads as "signed in" above (so launching the app doesn't
      // bounce them out to Welcome) — but GuestBanner's "Sign In Now"
      // deliberately navigates a guest INTO (auth) to convert to a real
      // account, and without this check that same "already signed in"
      // read would immediately redirect it straight back to Home.
    } else if (isSignedIn && isInAuthGroup && !isOnboarding && !isGuestSigningIn) {
      router.replace(ROUTES.HOME);
    }
  }, [isInitialized, user, isGuest, isGuestSigningIn, segments, router]);

  // Disguise Mode: hide the real app behind a working calculator until the
  // correct PIN is entered there. The flag is loaded into the store before
  // the navigator renders (`useDisguiseGate`), so this redirects without an
  // async read — the real Home tab no longer flashes first — and it re-runs
  // when the gate re-locks after time in the background. Skipped while the
  // calculator is showing so a PIN-unlock navigation isn't bounced back.
  const isDisguiseReady = useDisguiseGate();
  const isDisguiseEnabled = useDisguiseStore((state) => state.isEnabled);
  const isDisguiseUnlocked = useDisguiseStore((state) => state.isUnlockedThisSession);
  useEffect(() => {
    if (!isInitialized || isDisguiseEnabled !== true || isDisguiseUnlocked) return;
    if (segments[0] === DISGUISE_SEGMENT) return;
    router.replace(ROUTES.CALCULATOR);
  }, [isInitialized, isDisguiseEnabled, isDisguiseUnlocked, segments, router]);

  // Local notification handlers for Phase 7's background safety features —
  // see `useSuspiciousFollow` and `useSafeCheckin` for where these are fired.
  useEffect(() => {
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      const type = data.type as string | undefined;

      if (type === 'suspicious_follow') {
        Alert.alert(t('home.suspiciousFollowTitle'), t('home.suspiciousFollowBody'), [
          {
            text: t('home.triggerSos'),
            style: 'destructive',
            onPress: (): void => useSOSStore.getState().setActive(true, 'suspicious_follow'),
          },
          {
            text: t('location.liveLocation'),
            onPress: (): void => router.push(ROUTES.LIVE_LOCATION),
          },
          { text: t('common.cancel'), style: 'cancel' },
        ]);
      }

      if (type === 'safe_checkin') {
        router.push(ROUTES.SAFE_CHECKIN);
      }

      if (type === 'safe_journey') {
        router.push(ROUTES.SAFE_JOURNEY);
      }
    });

    return (): void => responseSub.remove();
  }, [router, t]);

  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        {/* Expo SDK 57's edge-to-edge Android default draws content behind a
            transparent status bar; without an explicit style the bar's own
            icon color is left to the OS default, which can render invisible
            against light screen backgrounds. `light` matches dark mode,
            `dark` matches this app's off-white/white screens; a full-bleed
            dark screen can override locally with its own <StatusBar/>. */}
        <StatusBar style={isDark ? 'light' : 'dark'} />
        {isInitialized && fontsLoaded && isDisguiseReady ? (
          // A bare <Slot/> only ever renders the current top-of-stack screen
          // — it unmounts everything underneath, including `(tabs)`. So
          // pushing any sibling screen (emergency-contacts, live-location,
          // incident-report, ...) from a non-Home tab and pressing back
          // remounted the Tabs navigator from scratch, always landing back
          // on its first screen (Home) instead of the tab the user left. A
          // real Stack keeps `(tabs)` mounted underneath, preserving which
          // tab was selected across the push/pop.
          <>
            <Stack screenOptions={{ headerShown: false }} />
            <GlobalSOSOverlay />
          </>
        ) : (
          <Spinner size="lg" className="flex-1 items-center justify-center" />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
