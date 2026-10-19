import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { COLORS } from '@/constants/colors';
import { ALL_CATEGORIES } from '@/constants/config';
import { formatTimestamp } from '@/utils/date.utils';

export interface OfflineBannerProps {
  /** When the currently shown content was last cached. */
  syncedAt: Date;
}

/** Amber notice shown when a screen is serving stale cache after a failed fetch. */
export function OfflineBanner({ syncedAt }: OfflineBannerProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-saffron/40 bg-saffron/10 p-3">
      <MaterialIcons name="wifi-off" size={16} color={COLORS.SAFFRON} />
      <Text variant="caption" className="flex-1">
        {t('info.offlineBanner', { date: formatTimestamp(syncedAt) })}
      </Text>
    </View>
  );
}

export interface CategoryFilterProps {
  /** Content categories, excluding the built-in "All" chip. */
  categories: string[];
  /** The selected category value, or `ALL_CATEGORIES`. */
  selected: string;
  onSelect: (category: string) => void;
}

/** Horizontal chip row for filtering an Information Hub list by category. */
export function CategoryFilter({
  categories,
  selected,
  onSelect,
}: CategoryFilterProps): React.JSX.Element {
  const { t } = useTranslation();
  const chips = [ALL_CATEGORIES, ...categories];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mb-3 min-h-[48px] flex-grow-0"
      contentContainerClassName="items-center gap-2"
    >
      {chips.map((category) => {
        const isSelected = category === selected;
        return (
          <Pressable
            key={category}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(category)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            className={
              isSelected
                ? 'min-h-[44px] items-center justify-center rounded-full bg-shakti-purple px-4 py-2'
                : 'min-h-[44px] items-center justify-center rounded-full border border-stone/20 bg-white px-4 py-2 dark:border-dark-border dark:bg-charcoal'
            }
          >
            <Text
              variant="caption"
              className={isSelected ? 'text-white' : 'text-stone dark:text-dark-text-secondary'}
            >
              {category === ALL_CATEGORIES ? t('info.allCategories') : category}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
