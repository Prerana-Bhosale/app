import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, View } from 'react-native';

import { GuestBanner } from '@/components/features/auth/GuestBanner';
import { ContactMultiSelect } from '@/components/features/location/ContactMultiSelect';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Text } from '@/components/ui/Text';
import { captureException } from '@/config/sentry';
import { COLORS } from '@/constants/colors';
import { APP_CONFIG, LIVE_LOCATION_DURATION_OPTIONS_HOURS } from '@/constants/config';
import { ICON_SIZE, TIMING } from '@/constants/ui';
import { useLiveLocation } from '@/hooks/useLiveLocation';
import { useAuthStore } from '@/stores/auth.store';
import { useUserStore } from '@/stores/user.store';
import { formatDuration } from '@/utils/date.utils';

const MS_PER_MINUTE = 60_000;

export default function LiveLocationScreen(): React.JSX.Element {
  const { t } = useTranslation();

  const isGuest = useAuthStore((state) => state.isGuest);
  const emergencyContacts = useUserStore((state) => state.emergencyContacts);
  const customContacts = useMemo(
    () => emergencyContacts.filter((contact) => !contact.isPredefined),
    [emergencyContacts],
  );

  const { isActive, expiresAt, currentLocationUrl, startSharing, stopSharing, extendTime } =
    useLiveLocation();

  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [selectedDuration, setSelectedDuration] = useState<number>(
    APP_CONFIG.LIVE_LOCATION_DEFAULT_HOURS,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => setNow(Date.now()), TIMING.SECOND_MS);
    return (): void => clearInterval(timer);
  }, [isActive]);

  const toggleContact = useCallback((id: string): void => {
    setSelectedContactIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }, []);

  const handleStart = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      await startSharing(selectedContactIds, selectedDuration);
    } catch (error) {
      captureException(error);
      Alert.alert(t('errors.generic'));
    } finally {
      setIsLoading(false);
    }
  }, [startSharing, selectedContactIds, selectedDuration, t]);

  const handleStop = useCallback((): void => {
    Alert.alert(t('location.stopSharingConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('location.stopSharing'),
        style: 'destructive',
        onPress: (): void => {
          stopSharing().catch((error: unknown) => {
            captureException(error);
            Alert.alert(t('errors.generic'));
          });
        },
      },
    ]);
  }, [stopSharing, t]);

  const handleExtend = useCallback((): void => {
    extendTime(1).catch((error: unknown) => {
      captureException(error);
      Alert.alert(t('errors.generic'));
    });
  }, [extendTime, t]);

  const remainingMinutes =
    expiresAt === null ? 0 : Math.max(0, Math.round((expiresAt.getTime() - now) / MS_PER_MINUTE));

  return (
    <ErrorBoundary>
      <SafeScreen scrollable>
        <ScreenHeader titleKey="location.liveLocation" />

        {isActive ? (
          <Card padding="lg" className="mt-2 border-2 border-forest-green">
            <View className="flex-row items-center gap-2">
              <View className="h-3 w-3 rounded-full bg-forest-green" />
              <Text variant="label">
                {t('location.sharingWith', { count: selectedContactIds.length })}
              </Text>
            </View>

            <View className="mt-3 flex-row items-center gap-2">
              <MaterialIcons name="timer" size={ICON_SIZE.STATUS} color={COLORS.STONE} />
              <Text variant="h3">{formatDuration(remainingMinutes)}</Text>
            </View>

            {currentLocationUrl !== null && (
              <Pressable
                className="mt-3"
                accessibilityRole="link"
                onPress={() => {
                  void Linking.openURL(currentLocationUrl).catch((error: unknown) =>
                    captureException(error),
                  );
                }}
              >
                <Text variant="caption" numberOfLines={1} className="text-shakti-purple">
                  {currentLocationUrl}
                </Text>
              </Pressable>
            )}

            <View className="mt-5 flex-row gap-3">
              <Button
                variant="outline"
                size="sm"
                label={t('location.extendOneHour')}
                onPress={handleExtend}
              />
              <Button
                variant="danger"
                size="sm"
                label={t('location.stopSharing')}
                onPress={handleStop}
              />
            </View>
          </Card>
        ) : (
          <View className="mt-2">
            {isGuest && <GuestBanner />}

            <Text variant="label" tKey="location.selectContacts" className="mb-2 mt-4" />

            <ContactMultiSelect
              contacts={customContacts}
              selectedIds={selectedContactIds}
              onToggle={toggleContact}
            />

            <Text variant="label" tKey="location.selectDuration" className="mb-2 mt-6" />
            <View className="flex-row flex-wrap gap-2">
              {LIVE_LOCATION_DURATION_OPTIONS_HOURS.map((hours) => {
                const selected = hours === selectedDuration;
                return (
                  <Pressable
                    key={hours}
                    onPress={() => setSelectedDuration(hours)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    className={`min-h-[44px] items-center justify-center rounded-full border px-4 py-2 ${
                      selected ? 'border-shakti-purple bg-shakti-purple' : 'border-stone/40'
                    }`}
                  >
                    <Text variant="caption" className={selected ? 'text-white' : 'text-stone'}>
                      {t('location.hoursShort', { count: hours })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              className="mt-8"
              label={t('location.startSharing')}
              loading={isLoading}
              disabled={selectedContactIds.length === 0 || isLoading}
              onPress={() => void handleStart()}
            />
          </View>
        )}
      </SafeScreen>
    </ErrorBoundary>
  );
}
