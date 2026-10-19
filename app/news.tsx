import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import { CategoryFilter, OfflineBanner } from '@/components/features/info/InfoFilters';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Spinner } from '@/components/ui/Spinner';
import { Text } from '@/components/ui/Text';
import { ALL_CATEGORIES, APP_CONFIG } from '@/constants/config';
import { ROUTES } from '@/constants/routes';
import { FLATLIST_PERF_PROPS } from '@/constants/ui';
import { byCategory, useInfoContent } from '@/hooks/useInfoContent';
import { getNews, type NewsArticle } from '@/services/firebase/news.service';
import { CACHE_KEYS } from '@/utils/cache.utils';
import { formatTimestamp } from '@/utils/date.utils';

function fetchNewsList(): Promise<NewsArticle[]> {
  return getNews(APP_CONFIG.NEWS_FEED_LIMIT);
}

export default function NewsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();

  const {
    items,
    categories,
    isLoading,
    hasError,
    isOffline,
    lastSyncDate,
    reload,
    refresh,
    isRefreshing,
  } = useInfoContent<NewsArticle>(fetchNewsList, byCategory, CACHE_KEYS.NEWS);

  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORIES);

  const filtered = useMemo(
    () =>
      items.filter(
        (article) => selectedCategory === ALL_CATEGORIES || article.category === selectedCategory,
      ),
    [items, selectedCategory],
  );

  if (isLoading) {
    return (
      <ErrorBoundary>
        <SafeScreen>
          <ScreenHeader titleKey="info.news" />
          <Spinner size="lg" className="flex-1 items-center justify-center" />
        </SafeScreen>
      </ErrorBoundary>
    );
  }

  if (hasError && items.length === 0) {
    return (
      <ErrorBoundary>
        <SafeScreen>
          <ScreenHeader titleKey="info.news" />
          <EmptyState
            icon="alert-circle-outline"
            title={t('info.loadError')}
            actionLabel={t('common.retry')}
            onAction={reload}
          />
        </SafeScreen>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <SafeScreen>
        <ScreenHeader titleKey="info.news" />

        {isOffline && lastSyncDate !== null && <OfflineBanner syncedAt={lastSyncDate} />}

        <CategoryFilter
          categories={categories}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
        />

        <FlatList
          testID="news-list"
          data={filtered}
          keyExtractor={(item) => item.id}
          className="flex-1"
          contentContainerClassName="pb-8"
          {...FLATLIST_PERF_PROPS}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`${ROUTES.NEWS}/${item.id}`)}>
              <View className="mb-3 overflow-hidden rounded-2xl border border-transparent bg-white shadow-sm dark:border-dark-border dark:bg-charcoal">
                {item.imageUrl !== '' && (
                  <Image
                    source={{ uri: item.imageUrl }}
                    className="h-44 w-full"
                    contentFit="cover"
                  />
                )}
                <View
                  className={item.imageUrl === '' ? 'border-t-4 border-shakti-purple p-4' : 'p-4'}
                >
                  <View className="mb-2 flex-row items-center justify-between">
                    <Badge variant="info" label={item.category} />
                    <Text variant="caption">{formatTimestamp(new Date(item.publishedAt))}</Text>
                  </View>
                  <Text variant="label" numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text variant="caption" numberOfLines={3} className="mt-1">
                    {item.summary}
                  </Text>
                </View>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={<EmptyState icon="newspaper-outline" title={t('info.noContent')} />}
        />
      </SafeScreen>
    </ErrorBoundary>
  );
}
