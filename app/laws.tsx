import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, TextInput, View } from 'react-native';

import { CategoryFilter, OfflineBanner } from '@/components/features/info/InfoFilters';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Spinner } from '@/components/ui/Spinner';
import { Text } from '@/components/ui/Text';
import { COLORS } from '@/constants/colors';
import { ALL_CATEGORIES, APP_CONFIG } from '@/constants/config';
import { ROUTES } from '@/constants/routes';
import { FLATLIST_PERF_PROPS } from '@/constants/ui';
import { byCategory, useInfoContent } from '@/hooks/useInfoContent';
import { getLaws, type Law } from '@/services/firebase/laws.service';
import { CACHE_KEYS } from '@/utils/cache.utils';
import { matchesSearch } from '@/utils/search.utils';

function matchesQuery(law: Law, query: string): boolean {
  return matchesSearch(query, [law.title, law.shortDescription, law.category, ...law.tags]);
}

export default function LawsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();

  const {
    items,
    categories,
    isLoading,
    isRefreshing,
    hasError,
    isOffline,
    lastSyncDate,
    reload,
    refresh,
  } = useInfoContent<Law>(getLaws, byCategory, CACHE_KEYS.LAWS);

  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORIES);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(
    () =>
      items.filter(
        (law) =>
          (selectedCategory === ALL_CATEGORIES || law.category === selectedCategory) &&
          matchesQuery(law, searchQuery),
      ),
    [items, selectedCategory, searchQuery],
  );

  if (isLoading) {
    return (
      <ErrorBoundary>
        <SafeScreen>
          <ScreenHeader titleKey="info.laws" />
          <Spinner size="lg" className="flex-1 items-center justify-center" />
        </SafeScreen>
      </ErrorBoundary>
    );
  }

  if (hasError && items.length === 0) {
    return (
      <ErrorBoundary>
        <SafeScreen>
          <ScreenHeader titleKey="info.laws" />
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
        <ScreenHeader titleKey="info.laws" />

        {isOffline && lastSyncDate !== null && <OfflineBanner syncedAt={lastSyncDate} />}

        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('info.search')}
          placeholderTextColor={COLORS.STONE}
          clearButtonMode="while-editing"
          className="mb-3 h-11 rounded-xl border border-stone/20 bg-white px-4 text-[16px] text-ink dark:border-dark-border dark:bg-charcoal dark:text-white"
        />

        <CategoryFilter
          categories={categories}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
        />

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          className="flex-1"
          contentContainerClassName="pb-8"
          {...FLATLIST_PERF_PROPS}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`${ROUTES.LAW_DETAIL}/${item.id}`)}>
              <Card padding="md" className="mb-3">
                <View className="flex-row items-center justify-between">
                  <Badge variant="info" label={item.category} />
                  <MaterialIcons name="chevron-right" size={16} color={COLORS.STONE} />
                </View>
                <Text variant="label" className="mt-1">
                  {item.title}
                </Text>
                <Text variant="caption" numberOfLines={2} className="mt-1">
                  {item.shortDescription}
                </Text>
                <View className="mt-2 flex-row flex-wrap gap-1">
                  {item.tags.slice(0, APP_CONFIG.LAW_CARD_TAG_PREVIEW_COUNT).map((tag) => (
                    <View key={tag} className="rounded bg-stone/10 px-2 py-0.5">
                      <Text variant="caption">{`#${tag}`}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title={t('info.noLawsFound')}
              subtitle={
                searchQuery.trim().length > 0 || selectedCategory !== ALL_CATEGORIES
                  ? t('info.noLawsFoundSubtitle')
                  : undefined
              }
            />
          }
        />
      </SafeScreen>
    </ErrorBoundary>
  );
}
