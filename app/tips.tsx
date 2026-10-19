import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, View } from 'react-native';

import { CategoryFilter, OfflineBanner } from '@/components/features/info/InfoFilters';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Spinner } from '@/components/ui/Spinner';
import { Text } from '@/components/ui/Text';
import { COLORS } from '@/constants/colors';
import { ALL_CATEGORIES } from '@/constants/config';
import { FLATLIST_PERF_PROPS } from '@/constants/ui';
import { byCategory, useInfoContent } from '@/hooks/useInfoContent';
import { trackTipsViewed } from '@/services/analytics.service';
import { getSafetyTips, type SafetyTip } from '@/services/firebase/laws.service';
import { CACHE_KEYS } from '@/utils/cache.utils';

type MaterialIconName = keyof typeof MaterialIcons.glyphMap;

interface CategoryIcon {
  name: MaterialIconName;
  color: string;
}

const CATEGORY_ICON: Record<string, CategoryIcon> = {
  Travel: { name: 'directions-car', color: COLORS.SHAKTI_PURPLE },
  Home: { name: 'home', color: COLORS.FOREST_GREEN },
  Workplace: { name: 'work', color: COLORS.SAFFRON },
  Online: { name: 'phone-android', color: COLORS.PRIMARY_RED },
  General: { name: 'shield', color: COLORS.STONE },
};

const FALLBACK_ICON: CategoryIcon = { name: 'shield', color: COLORS.STONE };

export default function TipsScreen(): React.JSX.Element {
  const { t } = useTranslation();

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
  } = useInfoContent<SafetyTip>(getSafetyTips, byCategory, CACHE_KEYS.TIPS);

  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORIES);

  useEffect((): void => {
    trackTipsViewed(selectedCategory);
  }, [selectedCategory]);

  const filtered = useMemo(
    () =>
      items.filter(
        (tip) => selectedCategory === ALL_CATEGORIES || tip.category === selectedCategory,
      ),
    [items, selectedCategory],
  );

  if (isLoading) {
    return (
      <ErrorBoundary>
        <SafeScreen>
          <ScreenHeader titleKey="info.tips" />
          <Spinner size="lg" className="flex-1 items-center justify-center" />
        </SafeScreen>
      </ErrorBoundary>
    );
  }

  if (hasError && items.length === 0) {
    return (
      <ErrorBoundary>
        <SafeScreen>
          <ScreenHeader titleKey="info.tips" />
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
        <ScreenHeader titleKey="info.tips" />

        {isOffline && lastSyncDate !== null && <OfflineBanner syncedAt={lastSyncDate} />}

        <CategoryFilter
          categories={categories}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
        />

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={2}
          className="flex-1"
          contentContainerClassName="pb-8"
          {...FLATLIST_PERF_PROPS}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
          renderItem={({ item }) => {
            const icon = CATEGORY_ICON[item.category] ?? FALLBACK_ICON;
            return (
              <View className="w-1/2 p-1.5">
                <Card padding="md" className="flex-1">
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-off-white dark:bg-dark-border">
                    <MaterialIcons name={icon.name} size={20} color={icon.color} />
                  </View>
                  <Text variant="label" className="mb-1 mt-3">
                    {item.title}
                  </Text>
                  <Text variant="caption">{item.content}</Text>
                </Card>
              </View>
            );
          }}
          ListEmptyComponent={<EmptyState icon="bulb-outline" title={t('info.noTipsFound')} />}
        />
      </SafeScreen>
    </ErrorBoundary>
  );
}
