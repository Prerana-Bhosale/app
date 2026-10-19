import { MaterialIcons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Alert, AppState, Linking, Platform, Pressable, View } from 'react-native';
import { z } from 'zod';

import { ContactFormModal } from '@/components/features/emergency/ContactFormModal';
import { DeviceContactPickerModal } from '@/components/features/emergency/DeviceContactPickerModal';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Input } from '@/components/ui/Input';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { Spinner } from '@/components/ui/Spinner';
import { Text } from '@/components/ui/Text';
import { captureException } from '@/config/sentry';
import {
  CITY_MAX,
  CITY_MIN,
  NAME_MAX,
  NAME_MIN,
  ONBOARDING_STEP_COUNT,
  PROFILE_PHOTO_ASPECT,
  PROFILE_PHOTO_QUALITY,
  REQUIRED_PERMISSIONS,
} from '@/constants/auth';
import { COLORS } from '@/constants/colors';
import { LANGUAGE_OPTIONS } from '@/constants/languages';
import { ROUTES } from '@/constants/routes';
import { STORAGE_FLAG_ON, STORAGE_KEYS } from '@/constants/storage';
import { ICON_SIZE } from '@/constants/ui';
import { changeLanguage, detectDeviceLanguage } from '@/i18n';
import {
  ANALYTICS_EVENTS,
  identifyUser,
  trackEmergencyContactChange,
  trackEvent,
} from '@/services/analytics.service';
import { getCurrentUser } from '@/services/firebase/auth.service';
import {
  addEmergencyContact,
  createUserProfile,
  deleteEmergencyContact,
  DuplicateContactError,
  uploadProfilePhoto,
} from '@/services/firebase/user.service';
import { useAuthStore } from '@/stores/auth.store';
import { useUserStore } from '@/stores/user.store';
import type { EmergencyContactFormValues } from '@/types/emergency.types';
import type { EmergencyContact, Language } from '@/types/user.types';
import { cacheEmergencyContacts } from '@/utils/offline-cache.utils';
import {
  checkAllPermissions,
  requestCameraPermission,
  requestContactsPermission,
  requestLocationPermission,
  requestNotificationPermission,
  requestSmsPermission,
  type PermissionKey,
} from '@/utils/permissions.utils';
import { formatIndianPhone } from '@/utils/phone.utils';

type IconName = keyof typeof MaterialIcons.glyphMap;

interface PermissionItem {
  key: PermissionKey;
  icon: IconName;
  required: boolean;
  titleKey: string;
  reasonKey: string;
  request: () => Promise<boolean>;
}

const ALL_PERMISSION_ITEMS: readonly PermissionItem[] = [
  {
    key: 'location',
    icon: 'location-on',
    required: true,
    titleKey: 'onboarding.locationPermission',
    reasonKey: 'onboarding.locationReason',
    request: requestLocationPermission,
  },
  {
    key: 'contacts',
    icon: 'contacts',
    required: true,
    titleKey: 'onboarding.contactsPermission',
    reasonKey: 'onboarding.contactsReason',
    request: requestContactsPermission,
  },
  {
    key: 'sms',
    icon: 'sms',
    required: false,
    titleKey: 'onboarding.smsPermission',
    reasonKey: 'onboarding.smsReason',
    request: requestSmsPermission,
  },
  {
    key: 'notifications',
    icon: 'notifications',
    required: false,
    titleKey: 'onboarding.notificationsPermission',
    reasonKey: 'onboarding.notificationsReason',
    request: requestNotificationPermission,
  },
  {
    key: 'camera',
    icon: 'camera-alt',
    required: false,
    titleKey: 'onboarding.cameraPermission',
    reasonKey: 'onboarding.cameraReason',
    request: requestCameraPermission,
  },
];

// iOS has no SMS / call permission to grant — SOS uses the compose sheet there.
const PERMISSION_ITEMS = ALL_PERMISSION_ITEMS.filter(
  (item) => item.key !== 'sms' || Platform.OS === 'android',
);

const profileSchema = z.object({
  name: z
    .string()
    .min(NAME_MIN, { message: 'onboarding.nameInvalid' })
    .max(NAME_MAX, { message: 'onboarding.nameInvalid' }),
  city: z
    .string()
    .min(CITY_MIN, { message: 'onboarding.cityInvalid' })
    .max(CITY_MAX, { message: 'onboarding.cityInvalid' }),
});

type ProfileForm = z.infer<typeof profileSchema>;

const LANGUAGE_STEP = 1;
const PERMISSIONS_STEP = 2;
const PROFILE_STEP = 3;
const CONTACTS_STEP = 4;

export default function OnboardingScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const setSurakshakUser = useAuthStore((state) => state.setSurakshakUser);
  const setProfileMirror = useUserStore((state) => state.setProfile);
  const storedContacts = useUserStore((state) => state.emergencyContacts);
  const setEmergencyContactsInStore = useUserStore((state) => state.setEmergencyContacts);

  const [step, setStep] = useState<number>(LANGUAGE_STEP);
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(detectDeviceLanguage);
  const [grantedPermissions, setGrantedPermissions] = useState<PermissionKey[]>([]);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [isPhotoUploading, setIsPhotoUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [contacts, setContacts] = useState<EmergencyContact[]>(() => storedContacts);
  const [formVisible, setFormVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [isAddingContact, setIsAddingContact] = useState(false);

  const existingPhones = useMemo(
    () => new Set(contacts.map((c) => formatIndianPhone(c.phone))),
    [contacts],
  );

  const {
    control,
    handleSubmit,
    formState: { isValid, errors },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    mode: 'onChange',
    defaultValues: { name: '', city: '' },
  });

  function handleSelectLanguage(code: Language): void {
    setSelectedLanguage(code);
    changeLanguage(code).catch((languageError: unknown) => captureException(languageError));
  }

  async function handleRequestPermission(item: PermissionItem): Promise<void> {
    try {
      const granted = await item.request();
      if (granted) {
        setGrantedPermissions((previous) =>
          previous.includes(item.key) ? previous : [...previous, item.key],
        );
      }
    } catch (permissionError) {
      captureException(permissionError);
    }
  }

  const refreshPermissions = useCallback(async (): Promise<void> => {
    try {
      const statuses = await checkAllPermissions();
      const grantedKeys = (Object.keys(statuses) as PermissionKey[]).filter(
        (key) => statuses[key] === true,
      );
      setGrantedPermissions((previous) => {
        const next = new Set([...previous, ...grantedKeys]);
        return [...next];
      });
    } catch (error) {
      captureException(error);
    }
  }, []);

  useEffect((): (() => void) | undefined => {
    if (step !== PERMISSIONS_STEP) return undefined;
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        void refreshPermissions();
      }
    });
    return (): void => subscription.remove();
  }, [step, refreshPermissions]);

  function handleContinueFromPermissions(): void {
    const requiredGranted = REQUIRED_PERMISSIONS.every((key) => grantedPermissions.includes(key));
    if (!requiredGranted) {
      Alert.alert(t('onboarding.cannotSkipRequired'), t('onboarding.openSettingsPrompt'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.openSettings'),
          onPress: (): void => {
            void Linking.openSettings();
          },
        },
      ]);
      return;
    }
    setStep(PROFILE_STEP);
  }

  async function handlePickPhoto(): Promise<void> {
    setIsPhotoUploading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: PROFILE_PHOTO_ASPECT,
        quality: PROFILE_PHOTO_QUALITY,
      });

      const asset = result.canceled ? undefined : result.assets[0];
      const user = getCurrentUser();
      if (asset === undefined || user === null) return;

      const url = await uploadProfilePhoto(user.uid, asset.uri);
      setProfilePhotoUrl(url);
    } catch (uploadError) {
      captureException(uploadError);
      Alert.alert(t('errors.uploadFailed'));
    } finally {
      setIsPhotoUploading(false);
    }
  }

  async function handleContinueFromProfile({ name, city }: ProfileForm): Promise<void> {
    const user = getCurrentUser();
    if (user === null) {
      // Auth state was lost between OTP and here — restart the sign-in flow.
      Alert.alert(t('errors.sessionExpired'));
      router.replace(ROUTES.PHONE);
      return;
    }

    setIsSaving(true);
    try {
      const profile = await createUserProfile(user.uid, {
        name,
        city,
        language: selectedLanguage,
        phone: user.phoneNumber ?? '',
        profilePhotoUrl: profilePhotoUrl ?? '',
      });
      setSurakshakUser(profile);
      setProfileMirror(profile);
      identifyUser(user.uid);
      setStep(CONTACTS_STEP);
    } catch (saveError) {
      captureException(saveError);
      Alert.alert(t('errors.generic'));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddContact(values: EmergencyContactFormValues): Promise<void> {
    const user = getCurrentUser();
    if (user === null) {
      Alert.alert(t('errors.sessionExpired'));
      return;
    }

    const normalizedPhone = formatIndianPhone(values.phone);
    const isDuplicate = contacts.some((c) => formatIndianPhone(c.phone) === normalizedPhone);
    if (isDuplicate) {
      Alert.alert(t('emergency.contactAlreadyExists'));
      return;
    }

    setIsAddingContact(true);
    try {
      const saved = await addEmergencyContact(user.uid, {
        ...values,
        phone: normalizedPhone,
        isPredefined: false,
        order: contacts.length,
      });
      trackEmergencyContactChange('added');
      const updated = [...contacts, saved];
      setContacts(updated);
      setEmergencyContactsInStore(updated);
      await cacheEmergencyContacts(updated);
      setFormVisible(false);
      setPickerVisible(false);
    } catch (error) {
      captureException(error);
      if (error instanceof DuplicateContactError) {
        Alert.alert(t('emergency.contactAlreadyExists'));
      } else {
        Alert.alert(t('errors.contactSaveFailed'));
      }
    } finally {
      setIsAddingContact(false);
    }
  }

  async function handleDeleteContact(contactId: string): Promise<void> {
    const user = getCurrentUser();
    if (user === null) return;
    try {
      await deleteEmergencyContact(user.uid, contactId);
      trackEmergencyContactChange('deleted');
      const updated = contacts.filter((c) => c.id !== contactId);
      setContacts(updated);
      setEmergencyContactsInStore(updated);
      await cacheEmergencyContacts(updated);
    } catch (error) {
      captureException(error);
      Alert.alert(t('errors.generic'));
    }
  }

  async function handleFinishOnboarding(): Promise<void> {
    if (contacts.length === 0) {
      Alert.alert(t('onboarding.atLeastOneContactRequired'));
      return;
    }

    const user = getCurrentUser();
    if (user === null) {
      Alert.alert(t('errors.sessionExpired'));
      router.replace(ROUTES.PHONE);
      return;
    }

    setIsSaving(true);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, STORAGE_FLAG_ON);
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
        language: selectedLanguage,
        permissions_granted: grantedPermissions,
        contacts_count: contacts.length,
      });
      router.replace(ROUTES.HOME);
    } catch (saveError) {
      captureException(saveError);
      Alert.alert(t('errors.generic'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ErrorBoundary>
      <SafeScreen scrollable>
        <View className="mb-8 mt-4 flex-row justify-center gap-3">
          {Array.from({ length: ONBOARDING_STEP_COUNT }, (_, index) => (
            <View
              key={`dot-${index}`}
              className={`h-2 w-2 rounded-full ${
                index < step ? 'bg-shakti-purple' : 'bg-stone/30'
              }`}
            />
          ))}
        </View>

        {step === LANGUAGE_STEP ? (
          <View>
            <Text variant="h2" tKey="onboarding.step1Title" />
            <Text
              variant="caption"
              tKey="onboarding.step1Subtitle"
              className="mb-6 mt-1 text-stone"
            />

            {LANGUAGE_OPTIONS.map((option) => {
              const isSelected = option.code === selectedLanguage;
              return (
                <Pressable
                  key={option.code}
                  onPress={() => handleSelectLanguage(option.code)}
                  accessibilityRole="button"
                  className={`mb-3 flex-row items-center rounded-2xl border p-4 ${
                    isSelected
                      ? 'border-2 border-shakti-purple bg-shakti-purple/10'
                      : 'border-stone/20 bg-white'
                  }`}
                >
                  <Text variant="h3" className="mr-3">
                    {option.flag}
                  </Text>
                  <View>
                    <Text variant="body">{option.native}</Text>
                    <Text variant="caption">{option.englishName}</Text>
                  </View>
                </Pressable>
              );
            })}

            <Button
              variant="primary"
              size="lg"
              fullWidth
              className="mt-6"
              label={t('onboarding.next')}
              onPress={() => setStep(PERMISSIONS_STEP)}
            />
          </View>
        ) : null}

        {step === PERMISSIONS_STEP ? (
          <View>
            <Text variant="h2" tKey="onboarding.step2Title" />
            <Text
              variant="caption"
              tKey="onboarding.step2Subtitle"
              className="mb-6 mt-1 text-stone"
            />

            {PERMISSION_ITEMS.map((item) => {
              const isGranted = grantedPermissions.includes(item.key);
              return (
                <Card key={item.key} padding="md" className="mb-3 flex-row items-center gap-3">
                  <MaterialIcons
                    name={item.icon}
                    size={ICON_SIZE.PERMISSION}
                    color={COLORS.SHAKTI_PURPLE}
                  />
                  <View className="flex-1">
                    <Text
                      variant="label"
                      tKey={item.titleKey}
                      className="text-ink dark:text-white"
                    />
                    <Text
                      variant="caption"
                      tKey={item.reasonKey}
                      className="text-stone dark:text-dark-text-secondary"
                    />
                    <Text
                      variant="caption"
                      tKey={item.required ? 'onboarding.required' : 'onboarding.recommended'}
                      className={
                        item.required
                          ? 'text-primary-red'
                          : 'text-stone dark:text-dark-text-secondary'
                      }
                    />
                  </View>
                  {isGranted ? (
                    <MaterialIcons
                      name="check-circle"
                      size={ICON_SIZE.STATUS}
                      color={COLORS.FOREST_GREEN}
                    />
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      label={t('onboarding.allow')}
                      onPress={() => void handleRequestPermission(item)}
                    />
                  )}
                </Card>
              );
            })}

            <Button
              variant="primary"
              size="lg"
              fullWidth
              className="mt-6"
              label={t('onboarding.next')}
              onPress={handleContinueFromPermissions}
            />
          </View>
        ) : null}

        {step === PROFILE_STEP ? (
          <View>
            <Text variant="h2" tKey="onboarding.step3Title" />
            <Text
              variant="caption"
              tKey="onboarding.step3Subtitle"
              className="mb-6 mt-1 text-stone"
            />

            <Pressable
              onPress={() => void handlePickPhoto()}
              accessibilityRole="button"
              className="mb-6 items-center"
            >
              {isPhotoUploading ? (
                <Spinner size="lg" />
              ) : profilePhotoUrl !== null ? (
                <Avatar size="lg" uri={profilePhotoUrl} />
              ) : (
                <Avatar size="lg" />
              )}
              <Text
                variant="label"
                tKey={profilePhotoUrl === null ? 'onboarding.addPhoto' : 'onboarding.changePhoto'}
                className="mt-2 text-shakti-purple"
              />
            </Pressable>

            <Controller
              control={control}
              name="name"
              render={({ field }) => (
                <Input
                  label={t('onboarding.nameLabel')}
                  placeholder={t('onboarding.namePlaceholder')}
                  value={field.value}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  error={errors.name ? t(errors.name.message ?? 'errors.generic') : undefined}
                />
              )}
            />
            <Controller
              control={control}
              name="city"
              render={({ field }) => (
                <Input
                  label={t('onboarding.cityLabel')}
                  placeholder={t('onboarding.cityPlaceholder')}
                  value={field.value}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  error={errors.city ? t(errors.city.message ?? 'errors.generic') : undefined}
                />
              )}
            />

            <Button
              variant="primary"
              size="lg"
              fullWidth
              className="mt-4"
              label={t('onboarding.next')}
              loading={isSaving}
              disabled={!isValid || isSaving}
              onPress={() => {
                void handleSubmit(handleContinueFromProfile)();
              }}
            />
          </View>
        ) : null}

        {step === CONTACTS_STEP ? (
          <View>
            <Text variant="h2" tKey="onboarding.step4Title" />
            <Text
              variant="caption"
              tKey="onboarding.step4Subtitle"
              className="mb-6 mt-1 text-stone"
            />

            {contacts.length === 0 ? (
              <Card padding="md" className="mb-4 items-center">
                <MaterialIcons name="contacts" size={48} color={COLORS.STONE} />
                <Text variant="label" tKey="emergency.noContactsYet" className="mt-2 text-center" />
                <Text
                  variant="caption"
                  tKey="emergency.addFirstContact"
                  className="mt-1 text-center text-stone"
                />
              </Card>
            ) : (
              contacts.map((contact) => (
                <Card
                  key={contact.id}
                  padding="md"
                  className="mb-3 flex-row items-center justify-between"
                >
                  <View className="flex-1">
                    <Text variant="label">{contact.name}</Text>
                    <Text variant="caption" className="text-stone">
                      {contact.phone} • {contact.relationship}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => void handleDeleteContact(contact.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.delete')}
                    hitSlop={ICON_SIZE.ROW}
                  >
                    <MaterialIcons
                      name="delete-outline"
                      size={ICON_SIZE.ROW}
                      color={COLORS.ERROR_RED}
                    />
                  </Pressable>
                </Card>
              ))
            )}

            <View className="gap-2">
              <Button
                variant="outline"
                size="md"
                fullWidth
                label={t('emergency.importFromContacts')}
                onPress={() => setPickerVisible(true)}
              />
              <Button
                variant="outline"
                size="md"
                fullWidth
                label={t('emergency.addContact')}
                onPress={() => setFormVisible(true)}
              />
            </View>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              className="mt-6"
              label={t('onboarding.getStarted')}
              loading={isSaving}
              disabled={contacts.length === 0 || isSaving}
              onPress={() => void handleFinishOnboarding()}
            />

            <ContactFormModal
              visible={formVisible}
              isSubmitting={isAddingContact}
              onSubmit={(values) => void handleAddContact(values)}
              onClose={() => setFormVisible(false)}
            />

            <DeviceContactPickerModal
              visible={pickerVisible}
              existingPhones={existingPhones}
              onPick={(values) => void handleAddContact(values)}
              onClose={() => setPickerVisible(false)}
            />
          </View>
        ) : null}
      </SafeScreen>
    </ErrorBoundary>
  );
}
