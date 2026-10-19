import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { APP_CONFIG } from '@/constants/config';
import { ROUTES } from '@/constants/routes';
import { STORAGE_KEYS } from '@/constants/storage';
import { trackDisguiseModeUnlocked } from '@/services/analytics.service';
import { useDisguiseStore } from '@/stores/disguise.store';
import {
  applyPercent,
  calculateResult,
  type CalculatorOperation,
  type CalculatorState,
  clearCalculator,
  initialCalculatorState,
  inputDecimal,
  inputDigit,
  inputOperation,
  toggleSign,
} from '@/utils/calculator.utils';
import { hashPin } from '@/utils/pin.utils';

type CalculatorKey =
  | { kind: 'digit'; value: string }
  | { kind: 'decimal' }
  | { kind: 'operation'; value: CalculatorOperation }
  | { kind: 'equals' }
  | { kind: 'clear' }
  | { kind: 'negate' }
  | { kind: 'percent' };

const KEY_ROWS: CalculatorKey[][] = [
  [{ kind: 'clear' }, { kind: 'negate' }, { kind: 'percent' }, { kind: 'operation', value: '÷' }],
  [
    { kind: 'digit', value: '7' },
    { kind: 'digit', value: '8' },
    { kind: 'digit', value: '9' },
    { kind: 'operation', value: '×' },
  ],
  [
    { kind: 'digit', value: '4' },
    { kind: 'digit', value: '5' },
    { kind: 'digit', value: '6' },
    { kind: 'operation', value: '-' },
  ],
  [
    { kind: 'digit', value: '1' },
    { kind: 'digit', value: '2' },
    { kind: 'digit', value: '3' },
    { kind: 'operation', value: '+' },
  ],
];

function keyLabel(key: CalculatorKey): string {
  switch (key.kind) {
    case 'digit':
      return key.value;
    case 'decimal':
      return '.';
    case 'operation':
      return key.value;
    case 'equals':
      return '=';
    case 'clear':
      return 'C';
    case 'negate':
      return '±';
    case 'percent':
      return '%';
  }
}

export default function CalculatorScreen(): React.JSX.Element {
  const router = useRouter();
  const [state, setState] = useState<CalculatorState>(initialCalculatorState);
  const [pinBuffer, setPinBuffer] = useState('');

  function pushPinDigit(digit: string): void {
    const next = (pinBuffer + digit).slice(-APP_CONFIG.DISGUISE_PIN_LENGTH);
    setPinBuffer(next);
  }

  async function handleEquals(): Promise<void> {
    if (pinBuffer.length === APP_CONFIG.DISGUISE_PIN_LENGTH) {
      const storedHash = await AsyncStorage.getItem(STORAGE_KEYS.DISGUISE_PIN_HASH);
      const candidateHash = await hashPin(pinBuffer);
      if (storedHash !== null && storedHash === candidateHash) {
        trackDisguiseModeUnlocked();
        useDisguiseStore.getState().unlock();
        setPinBuffer('');
        router.replace(ROUTES.HOME);
        return;
      }
    }
    setState((current) => calculateResult(current));
  }

  function handleKeyPress(key: CalculatorKey): void {
    switch (key.kind) {
      case 'digit':
        pushPinDigit(key.value);
        setState((current) => inputDigit(current, key.value));
        return;
      case 'decimal':
        setState((current) => inputDecimal(current));
        return;
      case 'operation':
        setState((current) => inputOperation(current, key.value));
        return;
      case 'clear':
        setPinBuffer('');
        setState(clearCalculator());
        return;
      case 'negate':
        setState((current) => toggleSign(current));
        return;
      case 'percent':
        setState((current) => applyPercent(current));
        return;
      case 'equals':
        void handleEquals();
        return;
    }
  }

  function keyClassName(key: CalculatorKey): string {
    if (key.kind === 'operation' || key.kind === 'equals') return 'bg-saffron';
    if (key.kind === 'clear' || key.kind === 'negate' || key.kind === 'percent') {
      return 'bg-stone';
    }
    return 'bg-charcoal';
  }

  return (
    <ErrorBoundary>
      <SafeAreaView className="flex-1 justify-end bg-near-black">
        <View className="w-full max-w-sm self-center px-4 pb-8">
          <View className="mb-6 items-end px-3">
            <RNText
              testID="calculator-display"
              className="text-6xl font-light text-white"
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {state.display}
            </RNText>
          </View>

          {KEY_ROWS.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} className="mb-3 flex-row gap-3">
              {row.map((key) => (
                <Pressable
                  key={keyLabel(key)}
                  onPress={() => handleKeyPress(key)}
                  accessibilityRole="button"
                  accessibilityLabel={keyLabel(key)}
                  className={`aspect-square flex-1 items-center justify-center rounded-full ${keyClassName(key)}`}
                >
                  <RNText className="text-2xl font-medium text-white">{keyLabel(key)}</RNText>
                </Pressable>
              ))}
            </View>
          ))}

          <View className="flex-row gap-3">
            <Pressable
              onPress={() => handleKeyPress({ kind: 'digit', value: '0' })}
              accessibilityRole="button"
              accessibilityLabel="0"
              className="flex-[2.15] self-stretch items-start justify-center rounded-full bg-charcoal pl-7"
            >
              <RNText className="text-2xl font-medium text-white">0</RNText>
            </Pressable>
            <Pressable
              onPress={() => handleKeyPress({ kind: 'decimal' })}
              accessibilityRole="button"
              accessibilityLabel="."
              className="aspect-square flex-1 items-center justify-center rounded-full bg-charcoal"
            >
              <RNText className="text-2xl font-medium text-white">.</RNText>
            </Pressable>
            <Pressable
              onPress={() => handleKeyPress({ kind: 'equals' })}
              accessibilityRole="button"
              accessibilityLabel="="
              className="aspect-square flex-1 items-center justify-center rounded-full bg-saffron"
            >
              <RNText className="text-2xl font-medium text-white">=</RNText>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </ErrorBoundary>
  );
}
