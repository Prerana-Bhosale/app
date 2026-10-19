import { router, Stack } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { Text } from '@/components/ui/Text';
import { ROUTES } from '@/constants/routes';

export default function NotFoundScreen(): React.JSX.Element {
  const { t } = useTranslation();

  function handleGoHome(): void {
    router.replace(ROUTES.HOME);
  }

  return (
    <ErrorBoundary>
      <Stack.Screen options={{ title: t('screens.notFound') }} />
      <SafeScreen className="items-center justify-center">
        <Text variant="h1" tKey="screens.notFound" className="text-center" />
        <Text variant="body" tKey="screens.notFoundMessage" className="mt-2 text-center" />
        <Button
          variant="primary"
          size="md"
          label={t('screens.goHome')}
          onPress={handleGoHome}
          className="mt-6 self-center"
        />
      </SafeScreen>
    </ErrorBoundary>
  );
}
