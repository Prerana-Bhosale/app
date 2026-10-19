import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Linking, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { captureException } from '@/config/sentry';
import { COLORS } from '@/constants/colors';
import { ROUTES } from '@/constants/routes';
import i18n from '@/i18n';
import { metroLogger } from '@/utils/logger.utils';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onReset?: () => void;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

const EMERGENCY_HELPLINE_NUMBER = '112';

/**
 * Every screen is wrapped in this — Surakshak absolute rule 10. A crash in a
 * safety app must never leave the user on a blank screen with no way back.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const componentStack = errorInfo.componentStack ?? 'No component stack available';
    metroLogger.error('ErrorBoundary caught a render failure', {
      domain: 'UI',
      operation: 'render',
      error,
      context: { componentStack },
    });
    captureException(error, {
      domain: 'UI',
      operation: 'render',
      extra: { componentStack },
    });
  }

  // Arrow property, not a method: passing a bound method as a callback prop
  // trips `@typescript-eslint/unbound-method` because the type carries `this`.
  private readonly handleRetry = (): void => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  };

  private readonly handleGoHome = (): void => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
    try {
      router.replace(ROUTES.HOME);
    } catch (navError) {
      metroLogger.warn('ErrorBoundary: failed to navigate home', {
        domain: 'UI',
        operation: 'navigateHome',
        error: navError,
      });
    }
  };

  private readonly handleCallEmergency = (): void => {
    void Linking.openURL(`tel:${EMERGENCY_HELPLINE_NUMBER}`).catch((callError: unknown) => {
      metroLogger.error('Direct emergency dial failed from ErrorBoundary', {
        domain: 'SOS',
        operation: 'callEmergency',
        error: callError,
      });
    });
  };

  public render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback !== undefined) {
      return this.props.fallback;
    }

    return (
      <SafeAreaView className="flex-1 bg-off-white dark:bg-near-black">
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="alert-circle-outline" size={64} color={COLORS.ERROR_RED} />

          <Text variant="h2" tKey="common.error" className="mt-4 text-center" />

          <Text variant="caption" tKey="errors.generic" className="mt-2 text-center" />

          <View className="mt-6 w-full gap-3">
            <Button
              variant="primary"
              size="md"
              fullWidth
              label={i18n.t('common.retry')}
              onPress={this.handleRetry}
              accessibilityLabel={i18n.t('common.retry')}
            />

            <Button
              variant="outline"
              size="md"
              fullWidth
              label={i18n.t('screens.goHome')}
              onPress={this.handleGoHome}
              accessibilityLabel={i18n.t('screens.goHome')}
            />

            <Button
              variant="danger"
              size="md"
              fullWidth
              leftIcon="call"
              label={i18n.t('emergency.callEmergency112')}
              onPress={this.handleCallEmergency}
              accessibilityLabel={i18n.t('emergency.callEmergency112')}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }
}
