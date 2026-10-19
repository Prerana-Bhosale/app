// SDK 57 deprecated `getContactsAsync` on the main entry — the read API now
// lives behind the `/legacy` subpath. Permission prompting still uses the
// non-deprecated main module via `permissions.utils`.
import { MaterialIcons } from '@expo/vector-icons';
import { Fields, getContactsAsync } from 'expo-contacts/legacy';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Linking, Modal, Pressable, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Text } from '@/components/ui/Text';
import { COLORS } from '@/constants/colors';
import type { EmergencyContactFormValues } from '@/types/emergency.types';
import { requestContactsPermission } from '@/utils/permissions.utils';
import { formatIndianPhone } from '@/utils/phone.utils';

export interface DeviceContactPickerModalProps {
  visible: boolean;
  /** Normalized E.164 phone numbers that already exist in the user's emergency contacts. */
  existingPhones: ReadonlySet<string>;
  onPick: (values: EmergencyContactFormValues) => void;
  onClose: () => void;
}

interface DeviceContactRow {
  key: string;
  name: string;
  phone: string;
}

export function DeviceContactPickerModal({
  visible,
  existingPhones,
  onPick,
  onClose,
}: DeviceContactPickerModalProps): React.JSX.Element {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [rows, setRows] = useState<DeviceContactRow[]>([]);

  // Parents usually pass `onClose` as an inline arrow. Reading it through a ref
  // keeps the load effect keyed on `visible` alone, so a parent re-render while
  // the picker is open doesn't refetch contacts and wipe the search text.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const handleClose = useCallback((): void => {
    setSearchQuery('');
    onClose();
  }, [onClose]);

  const handlePick = useCallback(
    (values: EmergencyContactFormValues): void => {
      setSearchQuery('');
      onPick(values);
    },
    [onPick],
  );

  useEffect(() => {
    if (!visible) return;

    let active = true;

    async function load(): Promise<void> {
      setLoading(true);
      setRows([]);
      setSearchQuery('');
      try {
        const granted = await requestContactsPermission();
        if (!granted) {
          Alert.alert(t('errors.contactsPermissionDenied'), undefined, [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('common.ok'),
              onPress: (): void => {
                void Linking.openSettings();
              },
            },
          ]);
          onCloseRef.current();
          return;
        }

        const { data } = await getContactsAsync({ fields: [Fields.PhoneNumbers] });

        const mapped: DeviceContactRow[] = data
          .map((contact, index) => {
            const phone = contact.phoneNumbers?.[0]?.number ?? '';
            return {
              key: contact.id ?? String(index),
              name: contact.name ?? '',
              phone,
            };
          })
          .filter((row) => row.phone.length > 0 && row.name.length > 0);

        if (active) setRows(mapped);
      } catch (error) {
        console.error('DeviceContactPickerModal load failed:', error);
        Alert.alert(t('errors.deviceContactsFailed'));
        onCloseRef.current();
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return (): void => {
      active = false;
    };
  }, [visible, t]);

  const filteredRows = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (trimmed.length === 0) return rows;

    const digitsQuery = trimmed.replace(/\D/g, '');

    return rows.filter((row) => {
      const matchesName = row.name.toLowerCase().includes(trimmed);
      const matchesRawPhone = row.phone.toLowerCase().includes(trimmed);
      const matchesDigits =
        digitsQuery.length > 0 && row.phone.replace(/\D/g, '').includes(digitsQuery);

      return matchesName || matchesRawPhone || matchesDigits;
    });
  }, [rows, searchQuery]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View className="flex-1 justify-end bg-near-black/40">
        <View className="h-3/4 w-full max-w-lg self-center rounded-t-3xl bg-off-white px-4 pb-8 pt-6 dark:bg-charcoal">
          <Text variant="h2" tKey="emergency.importFromContacts" className="mb-1" />
          <Text variant="caption" tKey="emergency.importSelectPrompt" className="mb-3" />

          {!loading && rows.length > 0 && (
            <View className="mb-3 flex-row items-center rounded-xl border border-stone/20 bg-white px-3 dark:border-dark-border dark:bg-charcoal">
              <MaterialIcons name="search" size={20} color={COLORS.STONE} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t('emergency.searchContacts')}
                placeholderTextColor={COLORS.STONE}
                className="ml-2 h-11 flex-1 text-[16px] text-ink dark:text-white"
                accessibilityLabel={t('emergency.searchContacts')}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && (
                <Pressable
                  onPress={() => setSearchQuery('')}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.close')}
                  hitSlop={8}
                >
                  <MaterialIcons name="close" size={18} color={COLORS.STONE} />
                </Pressable>
              )}
            </View>
          )}

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <Spinner size="lg" />
            </View>
          ) : rows.length === 0 ? (
            <EmptyState icon="person-outline" title={t('emergency.noContactsYet')} />
          ) : filteredRows.length === 0 ? (
            <EmptyState icon="search-outline" title={t('emergency.noMatchingContacts')} />
          ) : (
            <FlatList
              data={filteredRows}
              keyExtractor={(row) => row.key}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const normalizedPhone = formatIndianPhone(item.phone);
                const isAlreadyAdded = existingPhones.has(normalizedPhone);
                return (
                  <Pressable
                    onPress={() => {
                      if (!isAlreadyAdded) {
                        handlePick({ name: item.name, phone: item.phone, relationship: '' });
                      }
                    }}
                    disabled={isAlreadyAdded}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isAlreadyAdded }}
                    className={`border-b border-stone/15 py-3 ${
                      isAlreadyAdded ? 'opacity-40' : ''
                    }`}
                  >
                    <Text variant="body">{item.name}</Text>
                    <Text variant="caption">
                      {isAlreadyAdded ? t('emergency.alreadyAdded') : item.phone}
                    </Text>
                  </Pressable>
                );
              }}
            />
          )}

          <Button
            variant="ghost"
            size="md"
            fullWidth
            className="mt-2"
            label={t('common.cancel')}
            onPress={handleClose}
          />
        </View>
      </View>
    </Modal>
  );
}
