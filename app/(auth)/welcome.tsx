import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OtaUpdateBanner } from '@/components/features/settings/OtaUpdateBanner';
import { Button } from '@/components/ui/Button';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Text } from '@/components/ui/Text';
import { COLORS } from '@/constants/colors';
import { ROUTES } from '@/constants/routes';
import { ICON_SIZE } from '@/constants/ui';
import { ANALYTICS_EVENTS, trackEvent } from '@/services/analytics.service';
import { getCurrentUser } from '@/services/firebase/auth.service';
import { useAuthStore } from '@/stores/auth.store';

export default function WelcomeScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const setGuest = useAuthStore((state) => state.setGuest);

  useEffect(() => {
    if (getCurrentUser() !== null) {
      router.replace(ROUTES.HOME);
    }
  }, [router]);

  function handleContinueWithPhone(): void {
    router.push(ROUTES.PHONE);
  }

  function handleGuestMode(): void {
    setGuest(true);
    trackEvent(ANALYTICS_EVENTS.GUEST_SESSION_STARTED, {});
    router.replace(ROUTES.HOME);
  }

  return (
    <ErrorBoundary>
      <SafeAreaView
        className="flex-1 bg-off-white dark:bg-near-black"
        edges={['top', 'bottom', 'left', 'right']}
      >
        <View className="px-4 pt-4">
          <OtaUpdateBanner />
        </View>

        <View className="flex-1 items-center justify-center px-6">
          <MaterialIcons name="security" size={ICON_SIZE.BRAND} color={COLORS.PRIMARY_RED} />
          <Text variant="h1" tKey="home.title" className="mt-4" />
          <Text
            variant="body"
            tKey="home.tagline"
            className="mt-2 text-stone dark:text-dark-text-secondary"
          />
          <Text
            variant="caption"
            tKey="auth.tagline"
            className="mt-1 text-stone dark:text-dark-text-secondary"
          />
        </View>

        <View className="rounded-t-3xl border-t border-stone/10 bg-white px-6 pb-10 pt-8 dark:border-dark-border dark:bg-charcoal">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            label={t('auth.continueWithPhone')}
            onPress={handleContinueWithPhone}
          />
          <View className="h-4" />
          <Button
            variant="ghost"
            size="lg"
            fullWidth
            label={t('auth.continueAsGuest')}
            onPress={handleGuestMode}
          />
          <Text
            variant="caption"
            tKey="auth.guestWarning"
            className="mt-4 px-4 text-center text-stone dark:text-dark-text-secondary"
          />
        </View>
      </SafeAreaView>
    </ErrorBoundary>
  );
}
