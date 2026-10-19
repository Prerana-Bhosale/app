import React, { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

import { APP_CONFIG } from '@/constants/config';

export interface PinInputProps {
  onComplete: (pin: string) => void;
}

function emptyDigits(): string[] {
  return Array<string>(APP_CONFIG.DISGUISE_PIN_LENGTH).fill('');
}

/**
 * A row of PIN-entry boxes, styled like the OTP screen's digit input. The
 * parent resets an attempt by remounting this component with a new `key`
 * (see `DisguisePinModal`) rather than this component resetting its own
 * state from a prop change.
 */
export function PinInput({ onComplete }: PinInputProps): React.JSX.Element {
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const [digits, setDigits] = useState<string[]>(emptyDigits);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function handleChange(value: string, index: number): void {
    const sanitized = value.replace(/[^0-9]/g, '').slice(-1);
    const next = [...digits];
    next[index] = sanitized;
    setDigits(next);

    if (sanitized !== '' && index < APP_CONFIG.DISGUISE_PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    if (next.every((digit) => digit !== '')) {
      onComplete(next.join(''));
    }
  }

  function handleKeyPress(key: string, index: number): void {
    const isEmpty = digits[index] === undefined || digits[index] === '';
    if (key === 'Backspace' && isEmpty && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      inputRefs.current[index - 1]?.focus();
    }
  }

  return (
    <View className="flex-row justify-center gap-3">
      {digits.map((digit, index) => (
        <TextInput
          key={`pin-${index}`}
          testID={`pin-box-${index}`}
          ref={(element) => {
            inputRefs.current[index] = element;
          }}
          // `text-[20px]`, not `text-xl` — a coupled lineHeight fights
          // iOS's single-line TextInput auto-centering (see Input.tsx).
          className={`h-14 w-12 rounded-xl border-2 text-center text-[20px] font-semibold text-ink dark:bg-charcoal dark:text-white ${
            digit !== '' ? 'border-shakti-purple' : 'border-stone/30 dark:border-dark-border'
          }`}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={1}
          value={digit}
          onChangeText={(value) => handleChange(value, index)}
          onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
        />
      ))}
    </View>
  );
}
