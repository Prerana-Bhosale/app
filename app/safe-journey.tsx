import { MaterialIcons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { z } from 'zod';

import { GuestBanner } from '@/components/features/auth/GuestBanner';
import { ContactMultiSelect } from '@/components/features/location/ContactMultiSelect';
import { DestinationAutocomplete } from '@/components/features/location/DestinationAutocomplete';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Input } from '@/components/ui/Input';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Text } from '@/components/ui/Text';
import { captureException } from '@/config/sentry';
import { COLORS } from '@/constants/colors';
import { APP_CONFIG, SAFE_JOURNEY_ETA_PRESETS_MINUTES } from '@/constants/config';
import { ICON_SIZE, TIMING } from '@/constants/ui';
import { trackSafeJourneyArrived, trackSafeJourneyStarted } from '@/services/analytics.service';
import {
  cancelSafeJourney,
  checkInSafeJourney,
  createSafeJourneySession,
  extendSafeJourneyEta,
  getActiveJourneySession,
  markSafeJourneyArrived,
} from '@/services/firebase/safe-journey.service';
import { getCurrentLocation, getLocationWithTimeout } from '@/services/location.service';
import { recordSMSAlert, sendSafeJourneyStart } from '@/services/sms.service';
import { useAuthStore } from '@/stores/auth.store';
import { useLocationStore } from '@/stores/location.store';
import { useUserStore } from '@/stores/user.store';
import type { PlaceLocation, SafeJourneySession } from '@/types/location.types';
import { formatClockTime, formatCountdown } from '@/utils/date.utils';
import { getLocationUrl } from '@/utils/location.utils';
import { metroLogger } from '@/utils/logger.utils';
import {
  clearSafeJourneyArrivedOffline,
  markSafeJourneyArrivedOffline,
} from '@/utils/offline-cache.utils';

interface JourneyFormValues {
  destination: string;
  etaMinutes: number;
}

const DESTINATION_MIN = 2;
const DESTINATION_MAX = 100;
const MS_PER_MINUTE = 60_000;

function isExpired(session: SafeJourneySession): boolean {
  return session.expectedArrivalAt.toDate().getTime() <= Date.now();
}

export default function SafeJourneyScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();

  const surakshakUser = useAuthStore((state) => state.surakshakUser);
  const rawUser = useAuthStore((state) => state.user);
  const isGuest = useAuthStore((state) => state.isGuest);
  const userId = surakshakUser?.userId ?? rawUser?.uid ?? null;

  const emergencyContacts = useUserStore((state) => state.emergencyContacts);
  const customContacts = useMemo(
    () => emergencyContacts.filter((contact) => !contact.isPredefined),
    [emergencyContacts],
  );

  const setSafeJourneyActive = useLocationStore((state) => state.setSafeJourneyActive);
  const isSafeJourneyActive = useLocationStore((state) => state.isSafeJourneyActive);
  const bumpSafeJourneyRevision = useLocationStore((state) => state.bumpSafeJourneyRevision);

  const [activeSession, setActiveSession] = useState<SafeJourneySession | null>(null);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [destinationCoords, setDestinationCoords] = useState<PlaceLocation | null>(null);
  const [biasCoords, setBiasCoords] = useState<{ latitude: number; longitude: number } | undefined>(
    undefined,
  );
  const expiryReportedRef = useRef(false);

  // One-shot current location, only to bias the destination autocomplete.
  useEffect(() => {
    let active = true;
    void getCurrentLocation()
      .then((fix) => {
        if (active) setBiasCoords({ latitude: fix.latitude, longitude: fix.longitude });
      })
      .catch(() => undefined);
    return (): void => {
      active = false;
    };
  }, []);

  const schema = useMemo(
    () =>
      z.object({
        destination: z.string().trim().min(DESTINATION_MIN).max(DESTINATION_MAX),
        etaMinutes: z
          .number()
          .int()
          .min(APP_CONFIG.SAFE_JOURNEY_ETA_MIN_MINUTES)
          .max(APP_CONFIG.SAFE_JOURNEY_ETA_MAX_MINUTES),
      }),
    [],
  );

  const {
    control,
    handleSubmit,
    setValue,
    formState: { isValid, errors },
  } = useForm<JourneyFormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { destination: '', etaMinutes: APP_CONFIG.SAFE_JOURNEY_ETA_DEFAULT_MINUTES },
  });

  const etaMinutes = useWatch({ control, name: 'etaMinutes' });
  const destination = useWatch({ control, name: 'destination' });
  const [etaText, setEtaText] = useState(String(APP_CONFIG.SAFE_JOURNEY_ETA_DEFAULT_MINUTES));

  const toggleContact = useCallback((id: string): void => {
    setSelectedContactIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }, []);

  // An already-overdue journey is the app-wide monitor's to resolve (alert or
  // quietly expire) — showing it here at 0:00 is what let a stale session
  // fire the overdue SMS the moment the screen opened (BUG-028).
  const applySession = useCallback(
    (session: SafeJourneySession | null): void => {
      if (session !== null && isExpired(session)) {
        setActiveSession(null);
        bumpSafeJourneyRevision();
        return;
      }
      setActiveSession(session);
      if (session !== null) {
        setSafeJourneyActive(true, session.id);
        expiryReportedRef.current = false;
      }
    },
    [setSafeJourneyActive, bumpSafeJourneyRevision],
  );

  const refreshActiveSession = useCallback(async (): Promise<void> => {
    if (userId === null) return;
    applySession(await getActiveJourneySession(userId));
  }, [userId, applySession]);

  useEffect(() => {
    if (userId === null) return;
    let active = true;
    void getActiveJourneySession(userId)
      .then((session) => {
        if (active) applySession(session);
      })
      .catch((error: unknown) => captureException(error));
    return (): void => {
      active = false;
    };
  }, [userId, applySession]);

  const contactsFor = useCallback(
    (ids: string[]) => emergencyContacts.filter((contact) => ids.includes(contact.id)),
    [emergencyContacts],
  );

  // Per-second countdown tick for the active journey.
  useEffect(() => {
    if (activeSession === null) return;
    const timer = setInterval(() => setNow(Date.now()), TIMING.SECOND_MS);
    return (): void => clearInterval(timer);
  }, [activeSession]);

  const secondsLeft =
    activeSession === null
      ? 0
      : Math.max(0, Math.floor((activeSession.expectedArrivalAt.toDate().getTime() - now) / 1000));

  // At zero, hand over to the app-wide monitor (useSafeJourneyMonitor), which
  // owns the overdue alert whether or not this screen is open.
  useEffect(() => {
    if (activeSession === null || secondsLeft > 0 || expiryReportedRef.current) return;
    expiryReportedRef.current = true;
    bumpSafeJourneyRevision();
  }, [activeSession, secondsLeft, bumpSafeJourneyRevision]);

  // The monitor clears the store once it has resolved an overdue journey.
  useEffect(() => {
    if (isSafeJourneyActive || activeSession === null || secondsLeft > 0) return;
    const timer = setTimeout(() => setActiveSession(null), 0);
    return (): void => clearTimeout(timer);
  }, [isSafeJourneyActive, activeSession, secondsLeft]);

  const handleStart = useCallback(
    async (values: JourneyFormValues): Promise<void> => {
      if (userId === null) return;
      try {
        setIsLoading(true);
        const fix = await getLocationWithTimeout();
        // Prefer the picked place's coordinates; fall back to the current
        // position when the user typed a destination without picking one.
        const destLat = destinationCoords?.latitude ?? fix.latitude;
        const destLng = destinationCoords?.longitude ?? fix.longitude;
        const sessionId = await createSafeJourneySession(
          userId,
          values.destination.trim(),
          destLat,
          destLng,
          values.etaMinutes,
          selectedContactIds,
        );
        setSafeJourneyActive(true, sessionId);

        // A "journey started" note — the overdue warning is only ever sent
        // by the monitor once the deadline passes (BUG-028).
        const locationUrl = getLocationUrl(fix.latitude, fix.longitude);
        const name = surakshakUser?.name ?? 'User';
        const language = surakshakUser?.language ?? 'en';
        const result = await sendSafeJourneyStart(
          contactsFor(selectedContactIds),
          locationUrl,
          name,
          values.destination.trim(),
          formatClockTime(new Date(Date.now() + values.etaMinutes * MS_PER_MINUTE)),
          language,
        );
        await recordSMSAlert({
          type: 'safe_journey',
          locationUrl,
          contactsSent: result.sent,
          contactsFailed: result.failed,
        });
        trackSafeJourneyStarted(values.etaMinutes, selectedContactIds.length);
        if (result.failed.length > 0) {
          Alert.alert(
            t('location.journeyStartSmsFailedTitle'),
            t('location.journeyStartSmsFailedBody', { count: result.failed.length }),
          );
        }
        await refreshActiveSession();
        bumpSafeJourneyRevision();
      } catch (error) {
        captureException(error);
        Alert.alert(t('errors.generic'));
      } finally {
        setIsLoading(false);
      }
    },
    [
      userId,
      selectedContactIds,
      surakshakUser,
      contactsFor,
      setSafeJourneyActive,
      refreshActiveSession,
      bumpSafeJourneyRevision,
      destinationCoords,
      t,
    ],
  );

  const handleCheckIn = useCallback((): void => {
    if (activeSession === null) return;
    checkInSafeJourney(activeSession.id)
      .then(() => refreshActiveSession())
      .then(() => bumpSafeJourneyRevision())
      .catch((error: unknown) => {
        captureException(error);
        Alert.alert(t('errors.generic'));
      });
  }, [activeSession, refreshActiveSession, bumpSafeJourneyRevision, t]);

  const handleArrived = useCallback((): void => {
    if (activeSession === null) return;
    const sessionId = activeSession.id;
    Alert.alert(t('location.iArrivedConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('location.iArrived'),
        onPress: (): void => {
          // Immediately mark arrived locally and deactivate so the watchdog cannot fire a false overdue alert
          void markSafeJourneyArrivedOffline(sessionId);
          setSafeJourneyActive(false);
          setActiveSession(null);
          bumpSafeJourneyRevision();
          trackSafeJourneyArrived();
          router.back();

          markSafeJourneyArrived(sessionId)
            .then(() => clearSafeJourneyArrivedOffline(sessionId))
            .catch((error: unknown) => {
              metroLogger.warn('Arrival recorded offline; sync pending', {
                domain: 'LOCATION',
                operation: 'markArrived',
                context: { sessionId },
                error,
              });
              captureException(error);
            });
        },
      },
    ]);
  }, [activeSession, setSafeJourneyActive, bumpSafeJourneyRevision, router, t]);

  const handleExtend = useCallback(
    (minutes: number): void => {
      if (activeSession === null) return;
      extendSafeJourneyEta(activeSession.id, minutes)
        .then(() => refreshActiveSession())
        .then(() => bumpSafeJourneyRevision())
        .catch((error: unknown) => {
          captureException(error);
          Alert.alert(t('errors.generic'));
        });
    },
    [activeSession, refreshActiveSession, bumpSafeJourneyRevision, t],
  );

  const handleCancel = useCallback((): void => {
    if (activeSession === null) return;
    const sessionId = activeSession.id;
    Alert.alert(t('location.cancelJourneyConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('location.cancelJourney'),
        style: 'destructive',
        onPress: (): void => {
          setSafeJourneyActive(false);
          setActiveSession(null);
          bumpSafeJourneyRevision();
          router.back();

          cancelSafeJourney(sessionId).catch((error: unknown) => {
            metroLogger.warn('Cancellation recorded offline; sync pending', {
              domain: 'LOCATION',
              operation: 'cancelJourney',
              context: { sessionId },
              error,
            });
            captureException(error);
          });
        },
      },
    ]);
  }, [activeSession, setSafeJourneyActive, bumpSafeJourneyRevision, router, t]);

  const isFreeTextDestination =
    destinationCoords === null && destination.trim().length >= DESTINATION_MIN;

  return (
    <ErrorBoundary>
      <SafeScreen scrollable>
        <ScreenHeader titleKey="location.safeJourney" />

        {activeSession !== null ? (
          <View className="mt-2">
            <Card padding="lg" className="border-2 border-shakti-purple">
              <View className="flex-row items-center gap-2">
                <MaterialIcons
                  name="directions-walk"
                  size={ICON_SIZE.PERMISSION}
                  color={COLORS.SHAKTI_PURPLE}
                />
                <Text variant="h3" className="flex-1">
                  {activeSession.destinationName}
                </Text>
              </View>

              <Text variant="caption" className="mt-3">
                {t('location.arrivalTime')}
              </Text>
              <Text variant="label">
                {formatClockTime(activeSession.expectedArrivalAt.toDate())}
              </Text>

              <Text
                variant="h2"
                className={
                  secondsLeft <= APP_CONFIG.SAFE_JOURNEY_ALERT_WARN_SECONDS
                    ? 'mt-3 text-error-red'
                    : 'mt-3'
                }
              >
                {formatCountdown(secondsLeft)}
              </Text>
              <Text variant="caption" tKey="location.timeLeftCaption" className="text-stone" />
            </Card>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              className="mt-5"
              label={t('location.imSafe')}
              onPress={handleCheckIn}
            />
            <Text
              variant="caption"
              tKey="location.imSafeHint"
              className="mt-2 text-center text-stone"
            />
            <Button
              variant="secondary"
              size="md"
              fullWidth
              className="mt-3"
              label={t('location.iArrived')}
              onPress={handleArrived}
            />

            <View className="mt-3 flex-row gap-3">
              <Button
                variant="outline"
                size="sm"
                label={t('location.plus15Min')}
                onPress={() => handleExtend(15)}
              />
              <Button
                variant="outline"
                size="sm"
                label={t('location.plus30Min')}
                onPress={() => handleExtend(30)}
              />
            </View>

            <Button
              variant="ghost"
              size="md"
              className="mt-3"
              label={t('location.cancelJourney')}
              onPress={handleCancel}
            />
          </View>
        ) : (
          <View className="mt-2 pb-32">
            {isGuest && <GuestBanner />}

            <View className="mt-4">
              <Controller
                control={control}
                name="destination"
                render={({ field, fieldState }) => (
                  <DestinationAutocomplete
                    value={field.value}
                    onChangeText={(text) => {
                      field.onChange(text);
                      setDestinationCoords(null);
                    }}
                    onSelectPlace={(place) => {
                      field.onChange(place.name);
                      setDestinationCoords(place);
                    }}
                    bias={biasCoords}
                    error={fieldState.error?.message}
                  />
                )}
              />
              {isFreeTextDestination && (
                <Text
                  variant="caption"
                  tKey="location.destinationNotPicked"
                  className="mt-1 text-saffron"
                />
              )}
            </View>

            <Text variant="label" tKey="location.etaMinutes" className="mb-2" />
            <View className="flex-row flex-wrap gap-2">
              {SAFE_JOURNEY_ETA_PRESETS_MINUTES.map((minutes) => {
                const selected = minutes === etaMinutes;
                return (
                  <Button
                    key={minutes}
                    variant={selected ? 'secondary' : 'outline'}
                    size="sm"
                    label={t('location.minutesShort', { count: minutes })}
                    onPress={() => {
                      setEtaText(String(minutes));
                      setValue('etaMinutes', minutes, { shouldValidate: true });
                    }}
                  />
                );
              })}
            </View>

            <Input
              keyboardType="number-pad"
              value={etaText}
              onChangeText={(text) => {
                const digits = text.replace(/\D/g, '');
                setEtaText(digits);
                if (digits.length > 0) {
                  setValue('etaMinutes', Number.parseInt(digits, 10), { shouldValidate: true });
                } else {
                  setValue('etaMinutes', 0, { shouldValidate: true });
                }
              }}
              onBlur={() => {
                if (etaText.length === 0) {
                  setEtaText(String(APP_CONFIG.SAFE_JOURNEY_ETA_DEFAULT_MINUTES));
                  setValue('etaMinutes', APP_CONFIG.SAFE_JOURNEY_ETA_DEFAULT_MINUTES, {
                    shouldValidate: true,
                  });
                }
              }}
              className="mt-3"
            />
            {errors.etaMinutes !== undefined && (
              <Text
                variant="caption"
                tKey="location.etaInvalid"
                tOptions={{
                  min: APP_CONFIG.SAFE_JOURNEY_ETA_MIN_MINUTES,
                  max: APP_CONFIG.SAFE_JOURNEY_ETA_MAX_MINUTES,
                }}
                className="mt-1 text-error-red"
              />
            )}

            <Text variant="label" tKey="location.selectContacts" className="mb-2 mt-2" />
            <ContactMultiSelect
              contacts={customContacts}
              selectedIds={selectedContactIds}
              onToggle={toggleContact}
            />

            <Button
              variant="primary"
              size="lg"
              fullWidth
              className="mt-8"
              label={t('location.startJourney')}
              loading={isLoading}
              disabled={!isValid || selectedContactIds.length === 0 || isLoading}
              onPress={() => void handleSubmit(handleStart)()}
            />
          </View>
        )}
      </SafeScreen>
    </ErrorBoundary>
  );
}
