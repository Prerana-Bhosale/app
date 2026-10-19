import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { Text } from '@/components/ui/Text';
import { captureException } from '@/config/sentry';
import { COLORS } from '@/constants/colors';
import { ROUTES } from '@/constants/routes';
import { ICON_SIZE } from '@/constants/ui';
import { useTheme } from '@/hooks/useTheme';
import { trackInfoSectionOpened, type InfoSection } from '@/services/analytics.service';
import { CACHE_KEYS, getCacheTimestamp } from '@/utils/cache.utils';
import { formatTimestamp } from '@/utils/date.utils';

type MaterialIconName = keyof typeof MaterialIcons.glyphMap;

interface Section {
  key: InfoSection;
  labelKey: string;
  subtitleKey: string;
  icon: MaterialIconName;
  color: string;
  route: string;
}

const SECTIONS: readonly Section[] = [
  {
    key: 'laws',
    labelKey: 'info.laws',
    subtitleKey: 'info.lawsSubtitle',
    icon: 'gavel',
    color: COLORS.PRIMARY_RED,
    route: ROUTES.LAWS,
  },
  {
    key: 'faq',
    labelKey: 'info.faq',
    subtitleKey: 'info.faqSubtitle',
    icon: 'help',
    color: COLORS.FOREST_GREEN,
    route: ROUTES.FAQS,
  },
  {
    key: 'tips',
    labelKey: 'info.tips',
    subtitleKey: 'info.tipsSubtitle',
    icon: 'lightbulb',
    color: COLORS.SAFFRON,
    route: ROUTES.TIPS,
  },
  {
    key: 'news',
    labelKey: 'info.news',
    subtitleKey: 'info.newsSubtitle',
    icon: 'newspaper',
    color: COLORS.SHAKTI_PURPLE,
    route: ROUTES.NEWS,
  },
];

const ALL_CACHE_KEYS = [CACHE_KEYS.LAWS, CACHE_KEYS.FAQS, CACHE_KEYS.TIPS, CACHE_KEYS.NEWS];

export default function InfoScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const [lastSyncDate, setLastSyncDate] = useState<Date | null>(null);

  useEffect(() => {
    void Promise.all(ALL_CACHE_KEYS.map((key) => getCacheTimestamp(key)))
      .then((timestamps) => {
        const dates = timestamps.filter((value): value is Date => value !== null);
        if (dates.length === 0) return;
        const oldest = dates.reduce((min, date) => (date < min ? date : min));
        setLastSyncDate(oldest);
      })
      .catch((error: unknown) => captureException(error));
  }, []);

  const openSection = (section: Section): void => {
    trackInfoSectionOpened(section.key);
    router.push(section.route);
  };

  return (
    <ErrorBoundary>
      <SafeScreen scrollable>
        <Text variant="h2" tKey="info.title" className="mb-4 mt-2" />

        {SECTIONS.map((section) => (
          <Pressable
            key={section.key}
            accessibilityRole="button"
            accessibilityLabel={t(section.labelKey)}
            onPress={() => openSection(section)}
          >
            <Card padding="lg" className="mb-3">
              <View className="flex-row items-center gap-4">
                <View className="h-14 w-14 items-center justify-center rounded-2xl bg-off-white dark:bg-dark-border">
                  <MaterialIcons name={section.icon} size={28} color={section.color} />
                </View>
                <View className="flex-1">
                  <Text variant="label" tKey={section.labelKey} />
                  <Text variant="caption" tKey={section.subtitleKey} />
                </View>
                <MaterialIcons
                  name="chevron-right"
                  size={ICON_SIZE.CHEVRON}
                  color={colors.textSecondary}
                />
              </View>
            </Card>
          </Pressable>
        ))}

        {lastSyncDate !== null && (
          <View className="mt-4 flex-row items-center gap-2 rounded-xl border border-transparent bg-off-white p-3 dark:border-dark-border dark:bg-charcoal">
            <MaterialIcons name="offline-pin" size={16} color={colors.textSecondary} />
            <Text variant="caption" className="flex-1">
              {t('info.lastSynced', { date: formatTimestamp(lastSyncDate) })}
            </Text>
          </View>
        )}
      </SafeScreen>
    </ErrorBoundary>
  );
}
