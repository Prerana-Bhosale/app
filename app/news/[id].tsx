import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Spinner } from '@/components/ui/Spinner';
import { Text } from '@/components/ui/Text';
import { captureException } from '@/config/sentry';
import { COLORS } from '@/constants/colors';
import { trackNewsViewed } from '@/services/analytics.service';
import { getNewsById, type NewsArticle } from '@/services/firebase/news.service';
import { formatTimestamp } from '@/utils/date.utils';

export default function NewsDetailScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [item, setItem] = useState<NewsArticle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getNewsById(id)
      .then((result) => {
        if (cancelled) return;
        setItem(result);
        if (result) trackNewsViewed(result.id, result.category);
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
        <ScreenHeader titleKey="screens.newsDetail" />

        {isLoading ? (
          <Spinner size="lg" className="flex-1 items-center justify-center" />
        ) : item === null ? (
          <EmptyState
            icon="alert-circle-outline"
            title={t('info.loadError')}
            actionLabel={t('common.retry')}
            onAction={handleRetry}
          />
        ) : (
          <View>
            {item.imageUrl !== '' && (
              <Image
                source={{ uri: item.imageUrl }}
                className="h-56 w-full rounded-xl"
                contentFit="cover"
              />
            )}
            <View className="pt-4">
              <View className="mb-3 flex-row items-center justify-between">
                <Badge variant="info" label={item.category} />
                <Text variant="caption">{formatTimestamp(new Date(item.publishedAt))}</Text>
              </View>
              <Text variant="h2" className="mb-4">
                {item.title}
              </Text>
              <Text variant="body" className="leading-7">
                {item.content}
              </Text>
            </View>
          </View>
        )}
      </SafeScreen>
    </ErrorBoundary>
  );
}
