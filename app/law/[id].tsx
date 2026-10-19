import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Spinner } from '@/components/ui/Spinner';
import { Text } from '@/components/ui/Text';
import { captureException } from '@/config/sentry';
import { COLORS } from '@/constants/colors';
import { trackLawViewed } from '@/services/analytics.service';
import { getLawById, type Law } from '@/services/firebase/laws.service';

export default function LawDetailScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [law, setLaw] = useState<Law | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getLawById(id)
      .then((result) => {
        if (cancelled) return;
        setLaw(result);
        if (result) trackLawViewed(result.id, result.category);
      })
      .catch((error: unknown) => captureException(error))
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
          setRefreshing(false);
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, [id, reloadToken]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setReloadToken((prev) => prev + 1);
  }, []);

  const handleRetry = useCallback(() => {
    setIsLoading(true);
    setReloadToken((prev) => prev + 1);
  }, []);

  return (
    <ErrorBoundary>
      <SafeScreen
        scrollable
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.SHAKTI_PURPLE]}
            tintColor={COLORS.SHAKTI_PURPLE}
          />
        }
      >
        <ScreenHeader titleKey="screens.lawDetail" />

        {isLoading ? (
          <Spinner size="lg" className="flex-1 items-center justify-center" />
        ) : law === null ? (
          <EmptyState
            icon="alert-circle-outline"
            title={t('info.loadError')}
            actionLabel={t('common.retry')}
            onAction={handleRetry}
          />
        ) : (
          <View>
            <Badge variant="info" label={law.category} />

            <Text variant="h2" className="mb-2 mt-3">
              {law.title}
            </Text>

            <View className="mb-4 flex-row flex-wrap gap-2">
              {law.tags.map((tag) => (
                <View key={tag} className="rounded-full bg-stone/10 px-3 py-1">
                  <Text variant="caption">{`#${tag}`}</Text>
                </View>
              ))}
            </View>

            <Text variant="body" className="leading-7">
              {law.fullContent}
            </Text>

            <View className="my-6 h-px bg-stone/20" />

            <Card padding="md" className="bg-shakti-purple/10">
              <View className="flex-row gap-2">
                <MaterialIcons name="info" size={20} color={COLORS.SHAKTI_PURPLE} />
                <View className="flex-1">
                  <Text variant="label" tKey="info.legalHelpTitle" />
                  <Text variant="caption" tKey="info.legalHelpBody" className="mt-1" />
                </View>
              </View>
            </Card>
          </View>
        )}
      </SafeScreen>
    </ErrorBoundary>
  );
}
