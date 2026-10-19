import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { MIN_TOUCH_TARGET } from '@/constants/spacing';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type IconName = keyof typeof Ionicons.glyphMap;

export interface ButtonProps {
  variant: ButtonVariant;
  size: ButtonSize;
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  leftIcon?: IconName;
  rightIcon?: IconName;
  className?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

// Every variant reserves the same 2px border, transparent where a variant
// doesn't otherwise draw one — `outline` is the only one with a visible
// border color, but if the others didn't also reserve that space, a row of
// mixed variants (e.g. a selected/unselected toggle pair) would render the
// bordered one measurably taller than its borderless sibling.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary-red border-2 border-transparent',
  secondary: 'bg-shakti-purple border-2 border-transparent',
  danger: 'bg-error-red border-2 border-transparent',
  outline: 'bg-transparent border-2 border-shakti-purple',
  ghost: 'bg-transparent border-2 border-transparent',
};

const VARIANT_TEXT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'text-white',
  secondary: 'text-white',
  danger: 'text-white',
  outline: 'text-shakti-purple',
  ghost: 'text-shakti-purple',
};

const VARIANT_ICON_COLORS: Record<ButtonVariant, string> = {
  primary: COLORS.WHITE,
  secondary: COLORS.WHITE,
  danger: COLORS.WHITE,
  outline: COLORS.SHAKTI_PURPLE,
  ghost: COLORS.SHAKTI_PURPLE,
};

const DISABLED_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-disabled-bg dark:bg-dark-border border-2 border-transparent',
  secondary: 'bg-disabled-bg dark:bg-dark-border border-2 border-transparent',
  danger: 'bg-disabled-bg dark:bg-dark-border border-2 border-transparent',
  outline: 'bg-transparent border-2 border-stone/30 dark:border-dark-border',
  ghost: 'bg-transparent border-2 border-transparent',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-2',
  md: 'px-4 py-3',
  lg: 'px-6 py-4',
};

const SIZE_TEXT_CLASSES: Record<ButtonSize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
};

const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 };

export function Button({
  variant,
  size,
  label,
  onPress,
  loading = false,
  disabled = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  className,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps): React.JSX.Element {
  const isInert = disabled || loading;
  const variantClass = disabled ? DISABLED_VARIANT_CLASSES[variant] : VARIANT_CLASSES[variant];
  const textClass = disabled
    ? 'text-disabled-text dark:text-dark-text-secondary'
    : VARIANT_TEXT_CLASSES[variant];
  const iconColor = disabled ? COLORS.DISABLED_TEXT : VARIANT_ICON_COLORS[variant];

  const classes = [
    'flex-row items-center justify-center rounded-xl',
    variantClass,
    SIZE_CLASSES[size],
    fullWidth ? 'w-full' : 'self-start',
    loading ? 'opacity-70' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Pressable
      className={classes}
      onPress={onPress}
      disabled={isInert}
      // Guarantees the 44pt minimum target even for the `sm` size.
      hitSlop={MIN_TOUCH_TARGET / 4}
      accessibilityRole="button"
      accessibilityState={{ disabled: isInert, busy: loading }}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
    >
      {loading ? (
        <ActivityIndicator size="small" color={iconColor} />
      ) : (
        <View className="flex-row items-center justify-center">
          {leftIcon !== undefined && (
            <Ionicons name={leftIcon} size={ICON_SIZE[size]} color={iconColor} />
          )}
          <RNText
            className={`font-semibold ${textClass} ${SIZE_TEXT_CLASSES[size]} ${
              leftIcon !== undefined ? 'ml-2' : ''
            } ${rightIcon !== undefined ? 'mr-2' : ''}`}
          >
            {label}
          </RNText>
          {rightIcon !== undefined && (
            <Ionicons name={rightIcon} size={ICON_SIZE[size]} color={iconColor} />
          )}
        </View>
      )}
    </Pressable>
  );
}
