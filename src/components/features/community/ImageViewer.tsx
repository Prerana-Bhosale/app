import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/colors';
import { ICON_SIZE } from '@/constants/ui';

export interface ImageViewerProps {
  /** Single image to show (for backwards compatibility), or `null` to render nothing. */
  uri?: string | null;
  /** Multiple images to paginate through. Takes precedence if non-empty. */
  images?: string[];
  /** Zero-indexed initial image index when opening multi-image array. Defaults to 0. */
  initialIndex?: number;
  onClose: () => void;
}

export function ImageViewer({
  uri,
  images,
  initialIndex = 0,
  onClose,
}: ImageViewerProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const imageList = useMemo((): string[] => {
    if (images && images.length > 0) return images;
    if (typeof uri === 'string' && uri.length > 0) return [uri];
    return [];
  }, [images, uri]);

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [prevInitialIndex, setPrevInitialIndex] = useState(initialIndex);

  if (prevInitialIndex !== initialIndex) {
    setPrevInitialIndex(initialIndex);
    setCurrentIndex(initialIndex);
  }

  if (imageList.length === 0) return null;

  const currentUri = imageList[currentIndex] ?? imageList[0] ?? '';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        className="flex-1 items-center justify-center bg-near-black/90"
        onPress={onClose}
      >
        <Image source={{ uri: currentUri }} className="h-4/5 w-full" contentFit="contain" />

        {imageList.length > 1 && (
          <View
            className="absolute inset-x-0 bottom-10 flex-row items-center justify-between px-6"
            pointerEvents="box-none"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous image"
              disabled={currentIndex === 0}
              onPress={(event) => {
                event.stopPropagation?.();
                setCurrentIndex((idx) => Math.max(0, idx - 1));
              }}
              className={`rounded-full bg-white/20 p-3 ${
                currentIndex === 0 ? 'opacity-30' : 'opacity-100'
              }`}
            >
              <MaterialIcons name="chevron-left" size={28} color={COLORS.WHITE} />
            </Pressable>

            <View className="rounded-full bg-black/60 px-4 py-1.5">
              <Text className="text-sm font-medium text-white">
                {`${currentIndex + 1} / ${imageList.length}`}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next image"
              disabled={currentIndex === imageList.length - 1}
              onPress={(event) => {
                event.stopPropagation?.();
                setCurrentIndex((idx) => Math.min(imageList.length - 1, idx + 1));
              }}
              className={`rounded-full bg-white/20 p-3 ${
                currentIndex === imageList.length - 1 ? 'opacity-30' : 'opacity-100'
              }`}
            >
              <MaterialIcons name="chevron-right" size={28} color={COLORS.WHITE} />
            </Pressable>
          </View>
        )}

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
