import { MaterialIcons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { Badge } from '@/components/ui/Badge';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { captureException } from '@/config/sentry';
import { COLORS } from '@/constants/colors';
import { APP_CONFIG } from '@/constants/config';
import {
  PIN_CIRCLE_FILL,
  PIN_CIRCLE_STROKE,
  PIN_HEX,
  UNSAFE_AREA_CATEGORIES,
  UNSAFE_CATEGORY_LABEL_KEY,
} from '@/constants/map';
import { ROUTES } from '@/constants/routes';
import { ICON_SIZE } from '@/constants/ui';
import { useLocation } from '@/hooks/useLocation';
import { useTheme } from '@/hooks/useTheme';
import { trackUnsafeAreaReported, trackUnsafeAreaVoted } from '@/services/analytics.service';
import {
  reportUnsafeArea,
  subscribeToUnsafeAreas,
  voteOnUnsafeArea,
} from '@/services/firebase/unsafe-areas.service';
import { getFreshLocation } from '@/services/location.service';
import { useAuthStore } from '@/stores/auth.store';
import { useLocationStore } from '@/stores/location.store';
import type { UnsafeArea, UnsafeAreaCategory } from '@/types/location.types';
import { locationErrorKey } from '@/utils/location.utils';

interface ReportFormValues {
  title: string;
  description: string;
  category: UnsafeAreaCategory;
}

const TITLE_MIN = 3;
const TITLE_MAX = 100;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 500;

const styles = StyleSheet.create({
  map: { flex: 1 },
});

export default function MapScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();

  const isGuest = useAuthStore((state) => state.isGuest);
  const surakshakUser = useAuthStore((state) => state.surakshakUser);
  const rawUser = useAuthStore((state) => state.user);
  const userId = surakshakUser?.userId ?? rawUser?.uid ?? null;

  const { currentLocation, requestPermission } = useLocation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const cachedUnsafeAreas = useLocationStore((state) => state.cachedUnsafeAreas);
  const setCachedUnsafeAreas = useLocationStore((state) => state.setCachedUnsafeAreas);

  const [unsafeAreas, setUnsafeAreas] = useState<UnsafeArea[]>(cachedUnsafeAreas);
  // Only the id is kept: the card reads the area from the live list, so its
  // vote count and "already voted" state follow every snapshot instead of
  // freezing at the moment the pin was tapped (BUG-015).
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [votingAreaId, setVotingAreaId] = useState<string | null>(null);
  const [legendVisible, setLegendVisible] = useState(false);
  const [isReportModalVisible, setReportModalVisible] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);

  const mapRef = useRef<MapView | null>(null);
  const hasCenteredOnUserRef = useRef(false);

  const selectedArea = useMemo(
    () => unsafeAreas.find((area) => area.id === selectedAreaId) ?? null,
    [unsafeAreas, selectedAreaId],
  );

  useEffect(() => {
    void requestPermission().catch((error: unknown) => {
      console.warn('MapScreen: requestPermission failed:', error);
    });
  }, [requestPermission]);

  useEffect(() => {
    const unsubscribe = subscribeToUnsafeAreas((areas) => {
      setUnsafeAreas(areas);
      setCachedUnsafeAreas(areas);
    });
    return unsubscribe;
  }, [setCachedUnsafeAreas]);

  // Smoothly glide camera from fallback coordinates to actual GPS location
  // upon initial acquisition, without overriding manual map panning (BUG-064).
  useEffect(() => {
    if (currentLocation && !hasCenteredOnUserRef.current) {
      hasCenteredOnUserRef.current = true;
      mapRef.current?.animateToRegion(
        {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          latitudeDelta: APP_CONFIG.MAP_DEFAULT_LATITUDE_DELTA,
          longitudeDelta: APP_CONFIG.MAP_DEFAULT_LONGITUDE_DELTA,
        },
        800,
      );
    }
  }, [currentLocation]);

  const handlePanDrag = useCallback((): void => {
    hasCenteredOnUserRef.current = true;
  }, []);

  const initialRegion: Region = useMemo(
    () => ({
      latitude: currentLocation?.latitude ?? APP_CONFIG.MAP_FALLBACK_LATITUDE,
      longitude: currentLocation?.longitude ?? APP_CONFIG.MAP_FALLBACK_LONGITUDE,
      latitudeDelta: APP_CONFIG.MAP_DEFAULT_LATITUDE_DELTA,
      longitudeDelta: APP_CONFIG.MAP_DEFAULT_LONGITUDE_DELTA,
    }),
    [currentLocation],
  );

  const schema = useMemo(
    () =>
      z.object({
        title: z.string().trim().min(TITLE_MIN).max(TITLE_MAX),
        description: z.string().trim().min(DESCRIPTION_MIN).max(DESCRIPTION_MAX),
        category: z.enum(['poorly_lit', 'isolated', 'harassment_reported', 'other']),
      }),
    [],
  );

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { isValid },
  } = useForm<ReportFormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { title: '', description: '', category: 'poorly_lit' },
  });
  const selectedCategory = useWatch({ control, name: 'category' });

  const requireSignIn = useCallback((): boolean => {
    if (userId !== null && !isGuest) return false;
    Alert.alert(t('map.guestCannotReport'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.signInNow'), onPress: (): void => router.push(ROUTES.WELCOME) },
    ]);
    return true;
  }, [userId, isGuest, router, t]);

  const openReport = useCallback((): void => {
    if (requireSignIn()) return;
    reset({ title: '', description: '', category: 'poorly_lit' });
    setReportModalVisible(true);
  }, [requireSignIn, reset]);

  const submitReport = useCallback(
    async (values: ReportFormValues): Promise<void> => {
      if (userId === null) return;
      try {
        setSubmitting(true);
        const fix = await getFreshLocation();
        await reportUnsafeArea(
          userId,
          fix.latitude,
          fix.longitude,
          values.title.trim(),
          values.description.trim(),
          values.category,
        );
        setReportModalVisible(false);
        Alert.alert(t('map.reportSubmitted'));
        trackUnsafeAreaReported(values.category);
      } catch (error) {
        captureException(error);
        Alert.alert(t(locationErrorKey(error) ?? 'errors.generic'));
      } finally {
        setSubmitting(false);
      }
    },
    [userId, t],
  );

  const handleVote = useCallback(
    (area: UnsafeArea, vote: 'up' | 'down'): void => {
      if (requireSignIn() || userId === null || votingAreaId !== null) return;
      // One vote in flight at a time — a quick double tap used to pass the
      // "already voted" check twice.
      setVotingAreaId(area.id);
      voteOnUnsafeArea(area.id, userId, vote)
        .then(() => trackUnsafeAreaVoted(vote))
        .catch((error: unknown) => {
          captureException(error);
          Alert.alert(t('errors.generic'));
        })
        .finally(() => setVotingAreaId(null));
    },
    [requireSignIn, userId, votingAreaId, t],
  );

  const hasVoted =
    selectedArea !== null && userId !== null && selectedArea.voterIds.includes(userId);

  return (
    <ErrorBoundary>
      <View className="flex-1">
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          showsUserLocation
          showsMyLocationButton
          initialRegion={initialRegion}
          onPanDrag={handlePanDrag}
          // Android's My Location button defaults to top-right (rendering
          // under the status bar without this); iOS's defaults to
          // bottom-right (overlapping the report FAB there). `mapPadding`
          // insets the native controls' corners without moving the camera.
          mapPadding={{
            top: insets.top + APP_CONFIG.MAP_HEADER_HEIGHT,
            right: 0,
            bottom: insets.bottom + APP_CONFIG.MAP_CONTROL_BOTTOM_CLEARANCE,
            left: 0,
          }}
        >
          {unsafeAreas.map((area) => (
            <React.Fragment key={area.id}>
              <Marker
                coordinate={{ latitude: area.latitude, longitude: area.longitude }}
                pinColor={PIN_HEX[area.pinColor]}
                testID={`unsafe-area-${area.id}`}
                onPress={() => setSelectedAreaId(area.id)}
              />
              <Circle
                center={{ latitude: area.latitude, longitude: area.longitude }}
                radius={area.radiusMeters}
                strokeColor={PIN_CIRCLE_STROKE[area.pinColor]}
                fillColor={PIN_CIRCLE_FILL[area.pinColor]}
              />
            </React.Fragment>
          ))}
        </MapView>

        <SafeAreaView
          edges={['top', 'left', 'right']}
          pointerEvents="box-none"
          className="absolute inset-x-0 top-0"
        >
          <View className="flex-row items-center justify-between px-4 py-2">
            <Text
              variant="h3"
              tKey="map.title"
              className="rounded-lg border border-stone/20 bg-white/95 px-3 py-1 shadow-sm dark:border-dark-border dark:bg-charcoal/95"
            />
            <Pressable
              onPress={() => setLegendVisible((current) => !current)}
              accessibilityRole="button"
              accessibilityLabel={t('map.legend')}
              className="rounded-full border border-stone/20 bg-white/95 p-2 shadow-sm dark:border-dark-border dark:bg-charcoal/95"
            >
              <MaterialIcons name="info-outline" size={ICON_SIZE.ROW} color={colors.textPrimary} />
            </Pressable>
          </View>

          {legendVisible && (
            <Card padding="sm" className="mx-4 self-end">
              <View className="flex-row items-center gap-2 py-1">
                <View className="h-3 w-3 rounded-full bg-saffron" />
                <Text variant="caption" tKey="map.legendPending" />
              </View>
              <View className="flex-row items-center gap-2 py-1">
                <View className="h-3 w-3 rounded-full bg-primary-red" />
                <Text variant="caption" tKey="map.legendApproved" />
              </View>
            </Card>
          )}
        </SafeAreaView>

        {/* A labelled button rather than an icon-only FAB, and hidden while
            an area card would cover it (BUG-008). */}
        {selectedArea === null && (
          <Pressable
            onPress={openReport}
            accessibilityRole="button"
            accessibilityLabel={t('map.reportArea')}
            style={{ bottom: APP_CONFIG.MAP_FAB_OFFSET + insets.bottom }}
            className="absolute right-5 h-14 flex-row items-center gap-2 rounded-full bg-primary-red px-5 shadow-lg"
          >
            <MaterialIcons name="add-location" size={ICON_SIZE.ROW} color={COLORS.WHITE} />
            <Text variant="label" tKey="map.reportArea" className="text-white" />
          </Pressable>
        )}

        {selectedArea !== null && (
          <View className="absolute inset-x-0 bottom-0" style={{ paddingBottom: insets.bottom }}>
            <Card padding="lg" className="rounded-b-none">
              <View className="flex-row items-center justify-between">
                <Text variant="h3" className="flex-1">
                  {selectedArea.title}
                </Text>
                <Badge
                  variant={selectedArea.status === 'approved' ? 'error' : 'warning'}
                  label={t(selectedArea.status === 'approved' ? 'map.approved' : 'map.pending')}
                />
              </View>

              <Text variant="body" className="mt-2">
                {selectedArea.description}
              </Text>
              <Text variant="caption" className="mt-1">
                {t('map.reportAreaCategory')}: {t(UNSAFE_CATEGORY_LABEL_KEY[selectedArea.category])}
              </Text>

              <View className="mt-3 flex-row items-center gap-3">
                <Text variant="label" className="flex-1">
                  {t('map.votes', { count: selectedArea.upvotes - selectedArea.downvotes })}
                </Text>
                <Button
                  variant="ghost"
                  size="sm"
                  label={t('map.upvote')}
                  disabled={hasVoted || votingAreaId !== null}
                  onPress={() => handleVote(selectedArea, 'up')}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  label={t('map.downvote')}
                  disabled={hasVoted || votingAreaId !== null}
                  onPress={() => handleVote(selectedArea, 'down')}
                />
              </View>

              <Button
                variant="outline"
                size="sm"
                className="mt-3 self-center"
                label={t('common.close')}
                onPress={() => setSelectedAreaId(null)}
              />
            </Card>
          </View>
        )}

        <BottomSheet visible={isReportModalVisible} onClose={() => setReportModalVisible(false)}>
          <Text variant="h3" tKey="map.reportArea" />
          <Text variant="caption" tKey="map.reportUsesCurrentLocation" className="mt-1" />

          <Controller
            control={control}
            name="title"
            render={({ field, fieldState }) => (
              <Input
                label={t('map.reportAreaTitle')}
                value={field.value}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                error={fieldState.error?.message}
                className="mt-4"
              />
            )}
          />

          <Controller
            control={control}
            name="description"
            render={({ field, fieldState }) => (
              <Input
                label={t('map.reportAreaDescription')}
                multiline
                value={field.value}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />

          <Text variant="label" tKey="map.reportAreaCategory" className="mb-2" />
          <View className="flex-row flex-wrap gap-2">
            {UNSAFE_AREA_CATEGORIES.map((category) => {
              const selected = category === selectedCategory;
              return (
                <Button
                  key={category}
                  variant={selected ? 'secondary' : 'outline'}
                  size="sm"
                  label={t(UNSAFE_CATEGORY_LABEL_KEY[category])}
                  onPress={() => setValue('category', category, { shouldValidate: true })}
                />
              );
            })}
          </View>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            className="mt-6"
            label={t('common.send')}
            loading={isSubmitting}
            disabled={!isValid || isSubmitting}
            onPress={() => void handleSubmit(submitReport)()}
          />
          <Button
            variant="ghost"
            size="md"
            className="mt-2 self-center"
            label={t('common.cancel')}
            onPress={() => setReportModalVisible(false)}
          />
        </BottomSheet>
      </View>
    </ErrorBoundary>
  );
}
