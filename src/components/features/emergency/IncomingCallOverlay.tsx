import { Ionicons } from '@expo/vector-icons';
import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Vibration, View } from 'react-native';
import { setProximityScreenOff } from 'surakshak-native';

import { Text } from '@/components/ui/Text';
import { captureException } from '@/config/sentry';
import { COLORS } from '@/constants/colors';
import { TIMING } from '@/constants/ui';
import RINGTONE_SOURCE from '@assets/sounds/ringtone.wav';

export interface IncomingCallOverlayProps {
  visible: boolean;
  callerName: string;
  onAnswer: () => void;
  onDecline: () => void;
}

const SECONDS_PER_MINUTE = 60;
const CALL_BUTTON_ICON_SIZE = 32;
/** 1s buzz, 2s pause — a phone-ring cadence, restarted while the call rings. */
const RING_VIBRATION_PATTERN = [0, 1000, 2000];

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function IncomingCallOverlay({
  visible,
  callerName,
  onAnswer,
  onDecline,
}: IncomingCallOverlayProps): React.JSX.Element {
  const { t } = useTranslation();
  const [answered, setAnswered] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringtoneRef = useRef<AudioPlayer | null>(null);

  function resetCallState(): void {
    setAnswered(false);
    setElapsed(0);
  }

  useEffect(() => {
    const player = createAudioPlayer(RINGTONE_SOURCE);
    player.loop = true;
    ringtoneRef.current = player;
    return (): void => {
      player.pause();
      player.remove();
      ringtoneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const player = ringtoneRef.current;
    const ringing = visible && !answered;

    if (ringing) {
      void setAudioModeAsync({ playsInSilentMode: true });
      player?.play();
      Vibration.vibrate(RING_VIBRATION_PATTERN, true);
    } else {
      player?.pause();
      Vibration.cancel();
    }

    return (): void => {
      player?.pause();
      Vibration.cancel();
    };
  }, [visible, answered]);

  useEffect(() => {
    if (!answered) return;
    intervalRef.current = setInterval((): void => {
      setElapsed((value) => value + 1);
    }, TIMING.SECOND_MS);
    return (): void => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [answered]);

  // Like a real call, the screen goes dark against the ear once answered —
  // a fake call that stays lit was a giveaway (BUG-005).
  const inCall = visible && answered;
  useEffect(() => {
    if (!inCall) return;
    setProximityScreenOff(true).catch((error: unknown) => captureException(error));
    return (): void => {
      setProximityScreenOff(false).catch((error: unknown) => captureException(error));
    };
  }, [inCall]);

  function handleAnswer(): void {
    setAnswered(true);
    onAnswer();
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onShow={resetCallState}
      onRequestClose={onDecline}
    >
      <View className="flex-1 items-center justify-between bg-near-black px-8 py-20">
        <View className="items-center">
          <Text variant="h1" className="text-white">
            {callerName}
          </Text>
          <Text
            variant="body"
            tKey={answered ? 'emergency.inCall' : 'emergency.incomingCall'}
            className="mt-2 text-white"
          />
          {answered && (
            <Text variant="h3" className="mt-2 text-white">
              {formatElapsed(elapsed)}
            </Text>
          )}
        </View>

        <View className="w-full max-w-sm flex-row justify-around self-center">
          {answered ? (
            <View className="items-center">
              <Pressable
                onPress={onDecline}
                accessibilityRole="button"
                accessibilityLabel={t('emergency.endCall')}
                className="h-20 w-20 items-center justify-center rounded-full bg-error-red shadow-lg active:opacity-80"
              >
                <View style={{ transform: [{ rotate: '135deg' }] }}>
                  <Ionicons name="call" size={36} color={COLORS.WHITE} />
                </View>
              </Pressable>
              <Text variant="caption" tKey="emergency.endCall" className="mt-3 text-stone-300" />
            </View>
          ) : (
            <>
              <View className="items-center">
                <Pressable
                  onPress={onDecline}
                  accessibilityRole="button"
                  accessibilityLabel={t('emergency.decline')}
                  className="h-16 w-16 items-center justify-center rounded-full bg-error-red active:opacity-80"
                >
                  <View style={{ transform: [{ rotate: '135deg' }] }}>
                    <Ionicons name="call" size={CALL_BUTTON_ICON_SIZE} color={COLORS.WHITE} />
                  </View>
                </Pressable>
                <Text variant="caption" tKey="emergency.decline" className="mt-3 text-stone-300" />
              </View>
              <View className="items-center">
                <Pressable
                  onPress={handleAnswer}
                  accessibilityRole="button"
                  accessibilityLabel={t('emergency.answer')}
                  className="h-16 w-16 items-center justify-center rounded-full bg-forest-green active:opacity-80"
                >
                  <Ionicons name="call" size={CALL_BUTTON_ICON_SIZE} color={COLORS.WHITE} />
                </Pressable>
                <Text variant="caption" tKey="emergency.answer" className="mt-3 text-stone-300" />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
