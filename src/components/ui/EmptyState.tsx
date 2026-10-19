import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { Button, type IconName } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { COLORS } from '@/constants/colors';

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  subtitle?: string | undefined;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
}

export function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: EmptyStateProps): React.JSX.Element {
  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <Ionicons name={icon} size={56} color={COLORS.STONE} />

      <Text variant="h3" className="mt-4 text-center">
        {title}
      </Text>

      {subtitle !== undefined && (
        <Text variant="caption" className="mt-2 text-center">
          {subtitle}
        </Text>
      )}

      {actionLabel !== undefined && onAction !== undefined && (
        <Button
          variant="secondary"
          size="md"
          label={actionLabel}
          onPress={onAction}
          className="mt-6 self-center"
        />
      )}
    </View>
  );
}
