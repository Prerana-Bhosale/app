import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { FAKE_CALL_DELAY_OPTIONS_SECONDS } from '@/constants/config';

export interface FakeCallSchedulerProps {
  visible: boolean;
  onSchedule: (delaySeconds: number, callerName: string) => void;
  onClose: () => void;
}

const SECONDS_PER_MINUTE = 60;
const CUSTOM = 'custom';

export function FakeCallScheduler({
  visible,
  onSchedule,
  onClose,
}: FakeCallSchedulerProps): React.JSX.Element {
  const { t } = useTranslation();

  const [selected, setSelected] = useState<number | typeof CUSTOM>(
    FAKE_CALL_DELAY_OPTIONS_SECONDS[0],
  );
  const [customMinutes, setCustomMinutes] = useState('');
  const [callerName, setCallerName] = useState('');

  function resetToDefaults(): void {
    setSelected(FAKE_CALL_DELAY_OPTIONS_SECONDS[0]);
    setCustomMinutes('');
    setCallerName(t('emergency.callerNameDefault'));
  }

  function delayLabel(seconds: number): string {
    if (seconds === 0) return t('emergency.now');
    return t('emergency.minutesShort', { count: seconds / SECONDS_PER_MINUTE });
  }

  function resolveDelaySeconds(): number {
    if (selected !== CUSTOM) return selected;
    const minutes = Number.parseInt(customMinutes, 10);
    return Number.isFinite(minutes) && minutes > 0 ? minutes * SECONDS_PER_MINUTE : 0;
  }

  function handleSchedule(): void {
    const name = callerName.trim() || t('emergency.callerNameDefault');
    onSchedule(resolveDelaySeconds(), name);
  }

  return (
    <BottomSheet visible={visible} onShow={resetToDefaults} onClose={onClose}>
      <Text variant="h2" tKey="emergency.fakeCall" className="mb-4" />

      <Input label={t('emergency.callerName')} value={callerName} onChangeText={setCallerName} />

      <Text variant="label" tKey="emergency.callDelay" className="mb-2" />
      <View className="flex-row flex-wrap gap-2">
        {FAKE_CALL_DELAY_OPTIONS_SECONDS.map((seconds) => {
          const isSelected = selected === seconds;
          return (
            <Pressable
              key={seconds}
              onPress={() => setSelected(seconds)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              className={`min-h-[44px] items-center justify-center rounded-full border px-4 py-2 ${
                isSelected ? 'border-shakti-purple bg-shakti-purple/10' : 'border-stone/30'
              }`}
            >
              <Text variant="body">{delayLabel(seconds)}</Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setSelected(CUSTOM)}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === CUSTOM }}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          className={`min-h-[44px] items-center justify-center rounded-full border px-4 py-2 ${
            selected === CUSTOM ? 'border-shakti-purple bg-shakti-purple/10' : 'border-stone/30'
          }`}
        >
          <Text variant="body" tKey="emergency.customDelay" />
        </Pressable>
      </View>

      {selected === CUSTOM && (
        <Input
          className="mt-3"
          keyboardType="number-pad"
          placeholder={t('emergency.minutesShort', { count: 2 })}
          value={customMinutes}
          onChangeText={setCustomMinutes}
        />
      )}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        className="mt-4"
        label={t('emergency.scheduleCall')}
        onPress={handleSchedule}
      />
      <Button
        variant="ghost"
        size="md"
        fullWidth
        className="mt-2"
        label={t('common.cancel')}
        onPress={onClose}
      />
    </BottomSheet>
  );
}
