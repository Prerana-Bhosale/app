import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InteractionManager, Pressable, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { Spinner } from '@/components/ui/Spinner';
import { Text } from '@/components/ui/Text';
import { OTP_LENGTH, OTP_RESEND_SECONDS } from '@/constants/auth';
import { ROUTES } from '@/constants/routes';
import { ICON_SIZE, TIMING } from '@/constants/ui';
import { useTheme } from '@/hooks/useTheme';
import { ANALYTICS_EVENTS, trackEvent } from '@/services/analytics.service';
import { AuthError, sendOtp, verifyOtp } from '@/services/firebase/auth.service';
import { doesUserExist } from '@/services/firebase/user.service';
import { maskPhone } from '@/utils/phone.utils';

import { getStoredConfirmation, setStoredConfirmation } from './phone';

function emptyDigits(): string[] {
  return Array<string>(OTP_LENGTH).fill('');
}

export default function OtpScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { phone } = useLocalSearchParams<{ phone: string }>();

  const inputRefs = useRef<(TextInput | null)[]>([]);
  const [digits, setDigits] = useState<string[]>(emptyDigits);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(OTP_RESEND_SECONDS);

  // Autofocus the first box so the keyboard is already open when this screen
  // lands — `autoFocus` alone is dropped fairly often here because it fires
  // mid-way through expo-router's push transition; focusing once the
  // transition's interactions are done is reliable.
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      inputRefs.current[0]?.focus();
    });
    return (): void => task.cancel();
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;

    function tick(): void {
      setCountdown((current) => current - 1);
    }

    const timer = setInterval(tick, TIMING.SECOND_MS);
    return (): void => clearInterval(timer);
  }, [countdown]);

  async function handleVerify(code: string): Promise<void> {
    const confirmation = getStoredConfirmation();
    if (confirmation === null) {
      // The confirmation lives in module memory and is lost if the app is
      // killed mid-flow — send the user back to re-request an OTP.
      setError('errors.sessionExpired');
      router.replace(ROUTES.PHONE);
      return;
    }

    setIsVerifying(true);
    setError(null);
    try {
      const credential = await verifyOtp(confirmation, code);
      const isNewUser = !(await doesUserExist(credential.user.uid));
      trackEvent(ANALYTICS_EVENTS.OTP_VERIFIED, { is_new_user: isNewUser });
      setStoredConfirmation(null);
      router.replace(isNewUser ? ROUTES.ONBOARDING : ROUTES.HOME);
    } catch (verifyError) {
      const isAuthError = verifyError instanceof AuthError;
      const i18nKey = isAuthError ? verifyError.i18nKey : 'errors.generic';
      setError(i18nKey);

      const isCodeInvalid =
        isAuthError &&
        (verifyError.code === 'auth/invalid-verification-code' ||
          verifyError.code === 'auth/code-expired' ||
          verifyError.i18nKey === 'auth.otpInvalid' ||
          verifyError.i18nKey === 'auth.otpExpired');
      if (isCodeInvalid) {
        setDigits(emptyDigits());
        inputRefs.current[0]?.focus();
      }
    } finally {
      setIsVerifying(false);
    }
  }

  function handleDigitChange(value: string, index: number): void {
    if (isVerifying) return;

    const sanitized = value.replace(/[^0-9]/g, '');

    // A full code pasted into the first box.
    if (index === 0 && sanitized.length === OTP_LENGTH) {
      setDigits(sanitized.split(''));
      inputRefs.current[OTP_LENGTH - 1]?.focus();
      void handleVerify(sanitized);
      return;
    }

    const next = [...digits];
    next[index] = sanitized.slice(-1);
    setDigits(next);

    if (sanitized !== '' && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    if (next.every((digit) => digit !== '')) {
      void handleVerify(next.join(''));
    }
  }

  function handleKeyPress(key: string, index: number): void {
    if (isVerifying) return;

    const isEmpty = digits[index] === undefined || digits[index] === '';
    if (key === 'Backspace' && isEmpty && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleResend(): Promise<void> {
    if (phone === undefined || isResending) return;
    setIsResending(true);
    try {
      const confirmation = await sendOtp(phone);
      setStoredConfirmation(confirmation);
      setCountdown(OTP_RESEND_SECONDS);
      setDigits(emptyDigits());
      setError(null);
      inputRefs.current[0]?.focus();
    } catch (resendError) {
      setError(resendError instanceof AuthError ? resendError.i18nKey : 'errors.generic');
    } finally {
      setIsResending(false);
    }
  }

  function handleBack(): void {
    setStoredConfirmation(null);
    router.back();
  }

  return (
    <ErrorBoundary>
      <SafeScreen>
        <Pressable
          onPress={handleBack}
          className="mt-2 h-11 w-11 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <MaterialIcons name="arrow-back" size={ICON_SIZE.BACK} color={colors.textPrimary} />
        </Pressable>

        <Text variant="h2" tKey="auth.enterOtp" className="mb-2 mt-6" />
        <Text
          variant="caption"
          tKey="auth.otpSentTo"
          tOptions={{ phone: maskPhone(phone ?? '') }}
          className="text-stone dark:text-dark-text-secondary"
        />

        <View className="mb-4 mt-8 flex-row justify-between">
          {digits.map((digit, index) => (
            <TextInput
              key={`otp-${index}`}
              ref={(element) => {
                inputRefs.current[index] = element;
              }}
              // `text-[20px]`, not `text-xl` — a coupled lineHeight fights
              // iOS's single-line TextInput auto-centering (see Input.tsx).
              className={`h-14 w-12 rounded-xl border-2 text-center text-[20px] font-semibold text-ink dark:bg-charcoal dark:text-white ${
                digit !== '' ? 'border-shakti-purple' : 'border-stone/30 dark:border-dark-border'
              }`}
              editable={!isVerifying}
              keyboardType="number-pad"
              maxLength={index === 0 ? OTP_LENGTH : 1}
              value={digit}
              onChangeText={(value) => handleDigitChange(value, index)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
              accessibilityLabel={t('auth.enterOtp')}
            />
          ))}
        </View>

        {isVerifying ? <Spinner size="lg" className="mb-4 items-center" /> : null}

        {error !== null ? (
          <Text variant="caption" className="text-center text-error-red">
            {t(error)}
          </Text>
        ) : null}

        {error !== null && digits.every((digit) => digit !== '') && !isVerifying ? (
          <View className="mt-4">
            <Button
              variant="secondary"
              size="md"
              label={t('common.retry')}
              onPress={() => void handleVerify(digits.join(''))}
              fullWidth
            />
          </View>
        ) : null}

        <View className="mt-6 items-center">
          {countdown > 0 ? (
            <Text
              variant="caption"
              tKey="auth.resendIn"
              tOptions={{ seconds: countdown }}
              className="text-stone dark:text-dark-text-secondary"
            />
          ) : (
            <Pressable
              onPress={() => void handleResend()}
              accessibilityRole="button"
              disabled={isResending}
            >
              <Text
                variant="label"
                tKey="auth.resendOtp"
                className={isResending ? 'text-stone' : 'text-shakti-purple'}
              />
            </Pressable>
          )}
        </View>
      </SafeScreen>
    </ErrorBoundary>
  );
}
