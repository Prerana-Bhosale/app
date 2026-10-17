import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';

import { ContactFormModal } from '@/components/features/emergency/ContactFormModal';
import { DeviceContactPickerModal } from '@/components/features/emergency/DeviceContactPickerModal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Text } from '@/components/ui/Text';
import { captureException } from '@/config/sentry';
import { COLORS } from '@/constants/colors';
import { PREDEFINED_EMERGENCY_NUMBERS } from '@/constants/emergency-numbers';
import { DANGER_ROW_HITSLOP, ICON_SIZE } from '@/constants/ui';
import {
  trackEmergencyCallPlaced,
  trackEmergencyContactChange,
} from '@/services/analytics.service';
import {
  addEmergencyContact,
  deleteEmergencyContact,
  DuplicateContactError,
  getEmergencyContacts,
  updateEmergencyContact,
} from '@/services/firebase/user.service';
import { useAuthStore } from '@/stores/auth.store';
import { useUserStore } from '@/stores/user.store';
import type { EmergencyContactFormValues } from '@/types/emergency.types';
import type { EmergencyContact } from '@/types/user.types';
import { formatIndianPhone, placeCall } from '@/utils/phone.utils';

export default function EmergencyContactsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const userId = useAuthStore((state) => state.surakshakUser?.userId ?? null);
  const contacts = useUserStore((state) => state.emergencyContacts);
  const setEmergencyContacts = useUserStore((state) => state.setEmergencyContacts);

  const [formVisible, setFormVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [editing, setEditing] = useState<EmergencyContact | null>(null);
  const [prefill, setPrefill] = useState<EmergencyContact | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Synchronous re-entry guard: `isSubmitting` only disables the button after
  // a re-render, so two fast taps can both reach handleSubmit before it lands.
  const submittingRef = useRef(false);

  /**
   * Normalized E.164 phone numbers already saved as emergency contacts.
   * Used to block duplicates in the form and in the device-contact picker.
   * Stored numbers are normalized too — older documents are not all E.164.
   */
  const existingPhones = useMemo(
    () => new Set(contacts.map((c) => formatIndianPhone(c.phone))),
    [contacts],
  );

  const refresh = useCallback(async (): Promise<void> => {
    if (userId === null) return;
    const loaded = await getEmergencyContacts(userId);
    setEmergencyContacts(loaded);
  }, [userId, setEmergencyContacts]);

  useEffect(() => {
    refresh().catch((error: unknown) => {
      captureException(error);
      Alert.alert(t('errors.contactsLoadFailed'));
    });
  }, [refresh, t]);

  function call(name: string, phone: string, kind: 'predefined' | 'custom'): void {
    Alert.alert(t('emergency.callConfirm', { name, number: phone }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('emergency.callNow'),
        onPress: (): void => {
          trackEmergencyCallPlaced(kind);
          placeCall(phone).catch((error: unknown) => {
            captureException(error);
            Alert.alert(t('errors.callFailed'));
          });
        },
      },
    ]);
  }

  function openAdd(): void {
    setEditing(null);
    setPrefill(null);
    setFormVisible(true);
  }

  function openEdit(contact: EmergencyContact): void {
    setEditing(contact);
    setPrefill(null);
    setFormVisible(true);
  }

  function confirmDelete(contact: EmergencyContact): void {
    Alert.alert(t('emergency.deleteContactConfirm', { name: contact.name }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: (): void => {
          if (userId === null) return;
          deleteEmergencyContact(userId, contact.id)
            .then(() => {
              trackEmergencyContactChange('deleted');
              return refresh();
            })
            .catch((error: unknown) => {
              captureException(error);
              Alert.alert(t('errors.contactSaveFailed'));
            });
        },
      },
    ]);
  }

  function handleSubmit(values: EmergencyContactFormValues): void {
    if (userId === null) {
      setFormVisible(false);
      return;
    }
    if (submittingRef.current) return;

    const normalizedPhone = formatIndianPhone(values.phone);

    // Front-end duplicate guard: check the in-memory contact list before
    // hitting Firestore. This fires for both add and edit paths so that
    // editing contact A to use contact B's phone is also rejected.
    const isDuplicate = contacts.some(
      (c) =>
        formatIndianPhone(c.phone) === normalizedPhone &&
        // When editing, the same phone belonging to THIS contact is allowed.
        c.id !== (editing?.id ?? ''),
    );
    if (isDuplicate) {
      Alert.alert(t('emergency.contactAlreadyExists'));
      return;
    }

    const payload = { ...values, phone: normalizedPhone };
    const action = editing
      ? updateEmergencyContact(userId, editing.id, payload).then(() =>
          trackEmergencyContactChange('updated'),
        )
      : addEmergencyContact(userId, {
          ...payload,
          isPredefined: false,
          order: contacts.length,
        }).then(() => trackEmergencyContactChange('added'));

    submittingRef.current = true;
    setIsSubmitting(true);
    action
      .then(() => refresh())
      .then(() => {
        setFormVisible(false);
        Alert.alert(t('emergency.contactSaved'));
      })
      .catch((error: unknown) => {
        // The service re-checks Firestore, which catches duplicates the
        // in-memory list missed (e.g. it had not loaded yet).
        if (error instanceof DuplicateContactError) {
          Alert.alert(t('emergency.contactAlreadyExists'));
          return;
        }
        captureException(error);
        Alert.alert(t('errors.contactSaveFailed'));
      })
      .finally(() => {
        submittingRef.current = false;
        setIsSubmitting(false);
      });
  }

  function handleImportPick(values: EmergencyContactFormValues): void {
    setPickerVisible(false);
    setEditing(null);
    setPrefill({
      id: '',
      name: values.name,
      phone: values.phone,
      relationship: values.relationship,
      isPredefined: false,
      order: contacts.length,
    });
    setFormVisible(true);
  }

  return (
    <ErrorBoundary>
      <SafeScreen scrollable>
        <ScreenHeader titleKey="emergency.contacts" />

        <Text variant="label" tKey="emergency.predefinedContacts" className="mb-2 mt-2" />
        <Card padding="md">
          {PREDEFINED_EMERGENCY_NUMBERS.map((contact) => (
            <View
              key={contact.id}
              className="flex-row items-center gap-3 border-b border-stone/10 py-3 last:border-b-0"
            >
              <View className="h-9 w-9 items-center justify-center rounded-full bg-primary-red">
                <Ionicons name="call" size={ICON_SIZE.CHEVRON} color={COLORS.WHITE} />
              </View>
              <View className="flex-1">
                <Text variant="body">{contact.name}</Text>
                <Text variant="caption" className="text-stone">
                  {contact.phone}
                </Text>
              </View>
              <Pressable
                onPress={() => call(contact.name, contact.phone, 'predefined')}
                accessibilityRole="button"
                accessibilityLabel={t('emergency.callNow')}
                className="h-9 w-9 items-center justify-center rounded-full bg-forest-green"
                hitSlop={12}
              >
                <Ionicons name="call" size={ICON_SIZE.CHEVRON} color={COLORS.WHITE} />
              </Pressable>
              <MaterialIcons name="lock" size={14} color={COLORS.STONE} />
            </View>
          ))}
        </Card>

        <Text variant="label" tKey="emergency.myContacts" className="mb-2 mt-6" />
        {contacts.length === 0 ? (
          <EmptyState
            icon="person-add"
            title={t('emergency.noContactsYet')}
            actionLabel={t('emergency.addFirstContact')}
            onAction={openAdd}
          />
        ) : (
          <Card padding="md">
            {contacts.map((contact) => (
              <Pressable
                key={contact.id}
                onLongPress={() => openEdit(contact)}
                accessibilityRole="button"
                className="flex-row items-center gap-3 border-b border-stone/10 py-3 last:border-b-0"
              >
                <View className="flex-1">
                  <Text variant="body">{contact.name}</Text>
                  <Text variant="caption" className="text-stone">
                    {contact.relationship} · {contact.phone}
                  </Text>
                </View>
                <Pressable
                  onPress={() => call(contact.name, contact.phone, 'custom')}
                  accessibilityRole="button"
                  accessibilityLabel={t('emergency.callNow')}
                  className="h-9 w-9 items-center justify-center rounded-full bg-forest-green"
                  hitSlop={12}
                >
                  <Ionicons name="call" size={ICON_SIZE.CHEVRON} color={COLORS.WHITE} />
                </Pressable>
                <Pressable
                  onPress={() => confirmDelete(contact)}
                  accessibilityRole="button"
                  accessibilityLabel={t('emergency.deleteContact')}
                  hitSlop={DANGER_ROW_HITSLOP}
                >
                  <MaterialIcons name="delete-outline" size={ICON_SIZE.ROW} color={COLORS.STONE} />
                </Pressable>
              </Pressable>
            ))}
          </Card>
        )}

        <Button
          variant="outline"
          size="md"
          fullWidth
          className="mt-4"
          label={t('emergency.importFromContacts')}
          onPress={() => setPickerVisible(true)}
        />
        <Button
          variant="primary"
          size="md"
          fullWidth
          className="mt-2"
          label={t('emergency.addContact')}
          onPress={openAdd}
        />
      </SafeScreen>

      <ContactFormModal
        visible={formVisible}
        initial={editing ?? prefill}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onClose={() => setFormVisible(false)}
      />
      <DeviceContactPickerModal
        visible={pickerVisible}
        existingPhones={existingPhones}
        onPick={handleImportPick}
        onClose={() => setPickerVisible(false)}
      />
    </ErrorBoundary>
  );
}
