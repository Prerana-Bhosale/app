import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';

import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Text } from '@/components/ui/Text';
import { captureException } from '@/config/sentry';
import { COLORS } from '@/constants/colors';
import { LANGUAGE_OPTIONS } from '@/constants/languages';
import { ICON_SIZE } from '@/constants/ui';
import { useAuth } from '@/hooks/useAuth';
import { changeLanguage } from '@/i18n';
import { ANALYTICS_EVENTS, trackEvent } from '@/services/analytics.service';
import { getCurrentUser } from '@/services/firebase/auth.service';
import { updateUserProfile } from '@/services/firebase/user.service';
import { useAuthStore } from '@/stores/auth.store';
import { useUserStore } from '@/stores/user.store';
import type { Language } from '@/types/user.types';

export default function LanguageSelectScreen(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { surakshakUser } = useAuth();
  const setSurakshakUser = useAuthStore((state) => state.setSurakshakUser);
  const setProfileMirror = useUserStore((state) => state.setProfile);

  async function handleSelect(code: Language): Promise<void> {
    const previous = i18n.language;
    if (code === previous) {
      router.back();
      return;
    }

    try {
      await changeLanguage(code);
    } catch (error) {
      captureException(error);
      Alert.alert(t('errors.generic'));
      return;
    }

    try {
      const user = getCurrentUser();
      if (surakshakUser !== null && user !== null) {
        await updateUserProfile(user.uid, { language: code });
        const updated = { ...surakshakUser, language: code };
        setSurakshakUser(updated);
        setProfileMirror(updated);
      }

      trackEvent(ANALYTICS_EVENTS.LANGUAGE_CHANGED, { from: previous, to: code });
      router.back();
    } catch (error) {
      captureException(error);
      // The catalogue swapped but the choice didn't persist — put the UI back.
      await changeLanguage(previous as Language);
      Alert.alert(t('errors.generic'));
    }
  }

  return (
    <ErrorBoundary>
      <SafeScreen>
        <ScreenHeader titleKey="screens.languageSelect" />

        {LANGUAGE_OPTIONS.map((option) => {
          const isCurrent = option.code === i18n.language;
          return (
            <Pressable
              key={option.code}
              onPress={() => void handleSelect(option.code)}
              accessibilityRole="button"
              className={`mb-3 flex-row items-center rounded-2xl border p-4 ${
                isCurrent
                  ? 'border-2 border-shakti-purple bg-shakti-purple/10'
                  : 'border-stone/20 bg-white'
              }`}
            >
              <Text variant="h3" className="mr-3">
                {option.flag}
              </Text>
              <View className="flex-1">
                <Text variant="body">{option.native}</Text>
                <Text variant="caption">{option.englishName}</Text>
              </View>
              {isCurrent ? (
                <MaterialIcons name="check" size={ICON_SIZE.STATUS} color={COLORS.SHAKTI_PURPLE} />
              ) : null}
            </Pressable>
          );
        })}
      </SafeScreen>
    </ErrorBoundary>
  );
}
