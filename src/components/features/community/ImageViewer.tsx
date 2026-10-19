import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/colors';
import { ICON_SIZE } from '@/constants/ui';

export interface ImageViewerProps {
  /** The image to show, or `null` to render nothing. */
  uri: string | null;
  onClose: () => void;
}

export function ImageViewer({ uri, onClose }: ImageViewerProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  if (uri === null) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        className="flex-1 items-center justify-center bg-near-black/90"
        onPress={onClose}
      >
        <Image source={{ uri }} className="h-4/5 w-full" contentFit="contain" />
        <View
          className="absolute right-5 rounded-full bg-white/20 p-2"
          style={{ top: Math.max(insets.top, 16) + 12 }}
        >
          <MaterialIcons name="close" size={ICON_SIZE.BACK} color={COLORS.WHITE} />
        </View>
      </Pressable>
    </Modal>
  );
}
