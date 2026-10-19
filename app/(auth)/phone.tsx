import { MaterialIcons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ConfirmationResult } from '@react-native-firebase/auth';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { InteractionManager, Pressable, Text as RNText, TextInput, View } from 'react-native';
import { z } from 'zod';

import { Button } from '@/components/ui/Button';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { Text } from '@/components/ui/Text';
import {
  PHONE_DIGITS,
  PHONE_E164_PREFIX,
  PHONE_LAST_DIGITS,
  PHONE_PREFIX_LABEL,
} from '@/constants/auth';
import { ROUTES } from '@/constants/routes';
import { ICON_SIZE } from '@/constants/ui';
import { useTheme } from '@/hooks/useTheme';
import { ANALYTICS_EVENTS, trackEvent } from '@/services/analytics.service';
import { AuthError, sendOtp } from '@/services/firebase/auth.service';

/**
 * Survives the navigation from this screen to the OTP screen. A Firebase
 * `ConfirmationResult` is a live object and cannot be passed as a route param.
 */
let storedConfirmation: ConfirmationResult | null = null;

export function getStoredConfirmation(): ConfirmationResult | null {
  return storedConfirmation;
}

export function setStoredConfirmation(value: ConfirmationResult | null): void {
  storedConfirmation = value;
}

const schema = z.object({
  phone: z
    .string()
    .length(PHONE_DIGITS, { message: 'auth.phoneInvalid' })
    .regex(/^[6-9]\d{9}$/, { message: 'auth.phoneInvalid' }),
});

type PhoneForm = z.infer<typeof schema>;

export default function PhoneScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const phoneInputRef = useRef<TextInput | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<PhoneForm>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { phone: '' },
  });

  // Autofocus so the keyboard is already open when this screen lands — see
  // the matching note on the OTP screen for why this waits on
  // runAfterInteractions instead of a plain `autoFocus` prop.
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      phoneInputRef.current?.focus();
    });
    return (): void => task.cancel();
  }, []);

  async function handleSendOtp({ phone }: PhoneForm): Promise<void> {
    setIsLoading(true);
    setSubmitError(null);
    try {
      const confirmation = await sendOtp(phone);
      setStoredConfirmation(confirmation);
      trackEvent(ANALYTICS_EVENTS.OTP_REQUESTED, { phone_last4: phone.slice(-PHONE_LAST_DIGITS) });
      router.push({
        pathname: ROUTES.OTP,
        params: { phone: `${PHONE_E164_PREFIX}${phone}` },
      });
    } catch (error) {
      setSubmitError(error instanceof AuthError ? error.i18nKey : 'errors.generic');
    } finally {
      setIsLoading(false);
    }
  }

  const phoneError = errors.phone?.message;

  return (
    <ErrorBoundary>
      <SafeScreen>
        <Pressable
          onPress={() => router.back()}
          className="mt-2 h-11 w-11 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <MaterialIcons name="arrow-back" size={ICON_SIZE.BACK} color={colors.textPrimary} />
        </Pressable>

        <Text variant="h2" tKey="auth.enterPhone" className="mb-2 mt-6" />
        <Text
          variant="caption"
          tKey="auth.phonePlaceholder"
          className="text-stone dark:text-dark-text-secondary"
        />

        <View className="mt-6 h-14 flex-row items-center rounded-xl border border-stone/30 bg-white px-4 dark:border-dark-border dark:bg-charcoal">
          <RNText className="mr-2 text-base text-ink dark:text-white">{PHONE_PREFIX_LABEL}</RNText>
          <View className="mr-2 h-6 w-px bg-stone/30 dark:bg-dark-border" />
          <Controller
            control={control}
            name="phone"
            render={({ field }) => (
              <TextInput
                ref={(element) => {
                  field.ref(element);
                  phoneInputRef.current = element;
                }}
                // Font size only, not `text-base` — see Input.tsx's note on
                // why a coupled lineHeight fights iOS's single-line
                // TextInput auto-centering.
                className="flex-1 text-[16px] text-ink dark:text-white"
                keyboardType="phone-pad"
                maxLength={PHONE_DIGITS}
                placeholder={t('auth.phonePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={field.value}
                onBlur={field.onBlur}
                onChangeText={(text) => {
                  if (submitError !== null) setSubmitError(null);
                  field.onChange(text.replace(/\D/g, ''));
                }}
                accessibilityLabel={t('auth.phoneLabel')}
              />
            )}
          />
        </View>

        {phoneError !== undefined ? (
          <Text variant="caption" className="mt-1 text-error-red">
            {t(phoneError)}
          </Text>
        ) : submitError !== null ? (
          <Text variant="caption" className="mt-1 text-error-red">
            {t(submitError)}
          </Text>
        ) : null}

        <Button
          variant="primary"
          size="lg"
          fullWidth
          className="mt-8"
          label={t('auth.sendOtp')}
          loading={isLoading}
          disabled={!isValid || isLoading}
          onPress={() => {
            void handleSubmit(handleSendOtp)();
          }}
        />
      </SafeScreen>
    </ErrorBoundary>
  );
}
