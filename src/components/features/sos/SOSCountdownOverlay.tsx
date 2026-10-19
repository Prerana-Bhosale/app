import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';

import { Spinner } from '@/components/ui/Spinner';
import { Text } from '@/components/ui/Text';
import { COLORS } from '@/constants/colors';

export interface SOSCountdownOverlayProps {
  countdown: number;
  /** The countdown has elapsed and alerts are going out — no cancel. */
  isSending?: boolean;
  onCancel: () => void;
}

/**
 * Full-bleed overlay shown while the SOS countdown runs. Tapping anywhere on
 * the Cancel control aborts the alert before it fans out. Once the countdown
 * hits zero it switches to a non-cancellable "sending" state rather than
 * sitting frozen on 0 while the SMS goes out.
 */
export function SOSCountdownOverlay({
  countdown,
  isSending = false,
  onCancel,
}: SOSCountdownOverlayProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={isSending ? undefined : onCancel}
    >
      {isSending ? (
        <View
          className="flex-1 items-center justify-center bg-near-black/90 px-8"
          accessibilityLiveRegion="polite"
        >
          <Spinner size="lg" color={COLORS.WHITE} />
          <Text variant="h3" tKey="home.sosSending" className="mt-6 text-center text-white" />
        </View>
      ) : (
        <View className="flex-1 items-center justify-center bg-near-black/90 px-8">
          <Text variant="h1" className="text-6xl text-white">
            {String(countdown)}
          </Text>
          <Text
            variant="body"
            tKey="home.sosCountdown"
            tOptions={{ count: countdown }}
            className="mt-3 text-center text-white"
          />
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel={t('home.sosCancel')}
            className="mt-8 rounded-full bg-white px-8 py-4"
          >
            <Text variant="h3" className="text-error-red">
              {t('home.sosCancel')}
            </Text>
          </Pressable>
        </View>
      )}
    </Modal>
  );
}
