import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/colors';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/auth.store';

type IconName = keyof typeof Ionicons.glyphMap;

interface TabBarIconProps {
  color: ColorValue;
  size: number;
}

function tabIcon(name: IconName): (props: TabBarIconProps) => React.JSX.Element {
  return function TabBarIcon({ color, size }: TabBarIconProps): React.JSX.Element {
    return <Ionicons name={name} size={size} color={color} />;
  };
}

export default function TabsLayout(): React.JSX.Element {
  const { t } = useTranslation();
  const isGuest = useAuthStore((state) => state.isGuest);
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Brand colors stay the same in both themes — only the bar's own
        // background/border track system dark mode.
        tabBarActiveTintColor: COLORS.SHAKTI_PURPLE,
        tabBarInactiveTintColor: isDark ? colors.textSecondary : COLORS.STONE,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingBottom: insets.bottom,
          height: 56 + insets.bottom,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('nav.home'), tabBarIcon: tabIcon('shield-checkmark') }}
      />
      <Tabs.Screen
        name="map"
        // Reading unsafeAreas requires Firebase Auth, and guests never sign
        // in (isGuest is a local-only flag) — so the map has nothing to show
        // them. `href: null` hides the tab from the bar without unmounting
        // the route, so a signed-in user who converts mid-session gets it
        // back immediately.
        options={{
          title: t('nav.map'),
          tabBarIcon: tabIcon('map'),
          ...(isGuest ? { href: null } : {}),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{ title: t('nav.community'), tabBarIcon: tabIcon('people') }}
      />
      <Tabs.Screen
        name="info"
        options={{ title: t('nav.info'), tabBarIcon: tabIcon('information-circle') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('nav.profile'), tabBarIcon: tabIcon('person') }}
      />
    </Tabs>
  );
}
