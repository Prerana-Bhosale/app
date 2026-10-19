import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { captureException } from '@/config/sentry';
import { COLORS } from '@/constants/colors';
import { DANGER_ROW_HITSLOP, ICON_SIZE } from '@/constants/ui';
import type { CommunityPost } from '@/types/community.types';
import { formatTimestamp } from '@/utils/date.utils';

export interface PostCardProps {
  post: CommunityPost;
  isGuest: boolean;
  /** Shows a delete control instead of report on the viewer's own posts. */
  isOwn?: boolean;
  onReport: (postId: string) => void;
  onDelete?: (post: CommunityPost) => void;
  onOpenImage: (imageUrl: string) => void;
}

export function PostCard({
  post,
  isGuest,
  isOwn = false,
  onReport,
  onDelete,
  onOpenImage,
}: PostCardProps): React.JSX.Element {
  const { t } = useTranslation();

  const accent = post.type === 'help_request' ? 'mb-3 border-l-4 border-primary-red pl-3' : 'mb-3';
  const locationUrl = post.locationUrl;
  const imageUrl = post.imageUrl;

  return (
    <Card padding="md" className={accent}>
      <View className="flex-row items-center gap-3">
        {post.isAnonymous ? (
          <View className="h-12 w-12 items-center justify-center rounded-full bg-stone/10">
            <MaterialIcons name="person" size={ICON_SIZE.PERMISSION} color={COLORS.STONE} />
          </View>
        ) : (
          <Avatar uri={post.authorPhotoUrl} name={post.authorName} size="md" />
        )}

        <View className="flex-1">
          <Text variant="label">
            {post.isAnonymous ? t('community.anonymousUser') : post.authorName}
          </Text>
          <Text variant="caption">{formatTimestamp(post.createdAt?.toDate?.() ?? new Date())}</Text>
        </View>

        {isOwn && onDelete !== undefined && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('community.deletePost')}
            hitSlop={DANGER_ROW_HITSLOP}
            onPress={() => onDelete(post)}
          >
            <MaterialIcons name="delete-outline" size={ICON_SIZE.ROW} color={COLORS.STONE} />
          </Pressable>
        )}

        {!isGuest && !isOwn && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('community.flagPost')}
            hitSlop={DANGER_ROW_HITSLOP}
            onPress={() => onReport(post.id)}
          >
            <MaterialIcons name="flag" size={ICON_SIZE.ROW} color={COLORS.STONE} />
          </Pressable>
        )}
      </View>

      {post.type === 'help_request' && (
        <Badge variant="error" label={t('community.helpBadge')} className="mt-2" />
      )}

      <Text variant="body" className="mt-2">
        {post.content}
      </Text>

      {post.type === 'location' && locationUrl !== null && (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('community.viewOnMap')}
          onPress={() => {
            void Linking.openURL(locationUrl).catch((e: unknown) => captureException(e));
          }}
          className="mt-2 flex-row items-center gap-1"
        >
          <MaterialIcons name="place" size={ICON_SIZE.ROW} color={COLORS.SHAKTI_PURPLE} />
          <Text variant="label" className="text-shakti-purple">
            {t('community.viewOnMap')}
          </Text>
        </Pressable>
      )}

      {post.type === 'image' && imageUrl !== null && (
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel={t('community.viewImage')}
          onPress={() => onOpenImage(imageUrl)}
          className="mt-2"
        >
          <Image source={{ uri: imageUrl }} className="h-48 w-full rounded-xl" contentFit="cover" />
        </Pressable>
      )}
    </Card>
  );
}
