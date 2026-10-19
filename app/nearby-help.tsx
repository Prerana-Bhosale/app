import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  AppState,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Spinner } from '@/components/ui/Spinner';
import { Text } from '@/components/ui/Text';
import { captureException } from '@/config/sentry';
import { COLORS } from '@/constants/colors';
import { HELP_CATEGORIES, HELP_CATEGORY_ICON, HELP_CATEGORY_LABEL_KEY } from '@/constants/map';
import { ICON_SIZE } from '@/constants/ui';
import {
  trackNearbyHelpCalled,
  trackNearbyHelpDirections,
  trackNearbyHelpViewed,
} from '@/services/analytics.service';
import { fetchNearbyPlaces, getCurrentLocation } from '@/services/location.service';
import type { HelpCategory, NearbyPlace } from '@/types/location.types';
import { placeCall } from '@/utils/phone.utils';

type PlacesByCategory = Record<HelpCategory, NearbyPlace[]>;

const EMPTY_PLACES: PlacesByCategory = {
  police: [],
  hospital: [],
  fire_station: [],
  pharmacy: [],
};

function directionsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}

export default function NearbyHelpScreen(): React.JSX.Element {
  const { t } = useTranslation();

  const [activeCategory, setActiveCategory] = useState<HelpCategory>('police');
  const [places, setPlaces] = useState<PlacesByCategory>(EMPTY_PLACES);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setRefreshing] = useState(false);
  const [errorType, setErrorType] = useState<'location' | 'network' | null>(null);

  const fetchAllCategories = useCallback(async (): Promise<PlacesByCategory> => {
    const fix = await getCurrentLocation();
    const [police, hospital, fire, pharmacy] = await Promise.all([
      fetchNearbyPlaces(fix.latitude, fix.longitude, 'police'),
      fetchNearbyPlaces(fix.latitude, fix.longitude, 'hospital'),
      fetchNearbyPlaces(fix.latitude, fix.longitude, 'fire_station'),
      fetchNearbyPlaces(fix.latitude, fix.longitude, 'pharmacy'),
    ]);
    return { police, hospital, fire_station: fire, pharmacy };
  }, []);

  const resolveErrorType = (error: unknown): 'location' | 'network' => {
    const isLoc =
      error instanceof Error &&
      (error.message.includes('location') ||
        error.message.includes('permission') ||
        error.message.includes('Permission'));
    return isLoc ? 'location' : 'network';
  };

  useEffect(() => {
    void fetchAllCategories()
      .then((next) => {
        setPlaces(next);
        setErrorType(null);
      })
      .catch((error: unknown) => {
        captureException(error);
        setErrorType(resolveErrorType(error));
      })
      .finally(() => setIsLoading(false));
  }, [fetchAllCategories]);

  const onRefresh = useCallback((): void => {
    setRefreshing(true);
    void fetchAllCategories()
      .then((next) => {
        setPlaces(next);
        setErrorType(null);
      })
      .catch((error: unknown) => {
        captureException(error);
        setErrorType(resolveErrorType(error));
      })
      .finally(() => setRefreshing(false));
  }, [fetchAllCategories]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && errorType === 'location') {
        onRefresh();
      }
    });
    return (): void => subscription.remove();
  }, [errorType, onRefresh]);

  const selectCategory = useCallback((category: HelpCategory): void => {
    setActiveCategory(category);
    trackNearbyHelpViewed(category);
  }, []);

  const handleCall = useCallback(
    (place: NearbyPlace): void => {
      if (place.phoneNumber === undefined) return;
      trackNearbyHelpCalled(activeCategory);
      placeCall(place.phoneNumber).catch((error: unknown) => {
        captureException(error);
        Alert.alert(t('errors.callFailed'));
      });
    },
    [activeCategory, t],
  );

  const handleDirections = useCallback(
    (place: NearbyPlace): void => {
      trackNearbyHelpDirections(activeCategory);
      void Linking.openURL(directionsUrl(place.latitude, place.longitude)).catch((error: unknown) =>
        captureException(error),
      );
    },
    [activeCategory],
  );

  const list = places[activeCategory];

  return (
    <ErrorBoundary>
      <SafeScreen>
        <ScreenHeader titleKey="location.nearbyHelp" />

        <View className="flex-row border-b border-stone/20">
          {HELP_CATEGORIES.map((category) => {
            const selected = category === activeCategory;
            return (
              <Pressable
                key={category}
                onPress={() => selectCategory(category)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                className={`flex-1 items-center border-b-2 pb-2 ${
                  selected ? 'border-shakti-purple' : 'border-transparent'
                }`}
              >
                <MaterialIcons
                  name={HELP_CATEGORY_ICON[category]}
                  size={ICON_SIZE.ROW}
                  color={selected ? COLORS.SHAKTI_PURPLE : COLORS.STONE}
                />
                <Text
                  variant="caption"
                  className={selected ? 'text-shakti-purple' : 'text-stone'}
                  numberOfLines={1}
                >
                  {t(HELP_CATEGORY_LABEL_KEY[category])}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {isLoading ? (
          <Spinner size="lg" className="flex-1 items-center justify-center" />
        ) : errorType === 'location' ? (
          <EmptyState
            icon="location-outline"
            title={t('incidentReport.locationUnavailable')}
            subtitle={t('errors.locationPermissionDenied')}
            actionLabel={t('common.openSettings')}
            onAction={() => void Linking.openSettings()}
          />
        ) : errorType === 'network' ? (
          <EmptyState
            icon="warning"
            title={t('location.nearbyHelpError')}
            actionLabel={t('common.retry')}
            onAction={onRefresh}
          />
        ) : (
          <ScrollView
            className="mt-3"
            contentContainerClassName="pb-8"
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
          >
            {list.length === 0 ? (
              <Text variant="caption" tKey="location.noPlacesFound" className="mt-8 text-center" />
            ) : (
              list.map((place) => (
                <Card key={place.id} padding="md" className="mb-3">
                  <View className="flex-row items-start gap-3">
                    <MaterialIcons
                      name={HELP_CATEGORY_ICON[activeCategory]}
                      size={ICON_SIZE.PERMISSION}
                      color={COLORS.SHAKTI_PURPLE}
                    />
                    <View className="flex-1">
                      <Text variant="label">{place.name}</Text>
                      <Text variant="caption" numberOfLines={1} className="text-stone">
                        {place.address}
                      </Text>
                      <View className="mt-1 flex-row items-center gap-2">
                        <Text variant="caption" className="text-stone">
                          {t('location.kmAway', { distance: place.distanceKm.toFixed(1) })}
                        </Text>
                        {place.isOpen !== null && (
                          <Text
                            variant="caption"
                            className={place.isOpen ? 'text-forest-green' : 'text-error-red'}
                          >
                            {t(place.isOpen ? 'location.open' : 'location.closed')}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>

                  <View className="mt-3 flex-row gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      label={t('location.call')}
                      disabled={place.phoneNumber === undefined}
                      onPress={() => handleCall(place)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      label={t('location.directions')}
                      onPress={() => handleDirections(place)}
                    />
                  </View>
                </Card>
              ))
            )}
          </ScrollView>
        )}
      </SafeScreen>
    </ErrorBoundary>
  );
}
