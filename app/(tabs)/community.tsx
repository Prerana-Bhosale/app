import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Linking, Pressable, Switch, TextInput, View } from 'react-native';

import { GuestBanner } from '@/components/features/auth/GuestBanner';
import { ImageViewer } from '@/components/features/community/ImageViewer';
import { PostCard } from '@/components/features/community/PostCard';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { Spinner } from '@/components/ui/Spinner';
import { Text } from '@/components/ui/Text';
import { captureException } from '@/config/sentry';
import { COLORS } from '@/constants/colors';
import { APP_CONFIG, COMMUNITY_IMAGE_ASPECT } from '@/constants/config';
import { ICON_SIZE } from '@/constants/ui';
import { useCommunity } from '@/hooks/useCommunity';
import { useTheme } from '@/hooks/useTheme';
import { getCurrentLocation } from '@/services/location.service';
import { useAuthStore } from '@/stores/auth.store';
import type {
  CommunityPost,
  CommunityTab,
  CreatePostInput,
  PostType,
} from '@/types/community.types';
import { getLocationUrl } from '@/utils/location.utils';

const TABS: readonly CommunityTab[] = ['city', 'all_india'];

const TYPE_ICON: Record<PostType, keyof typeof MaterialIcons.glyphMap> = {
  text: 'chat',
  location: 'place',
  image: 'image',
  help_request: 'sos',
};

const TYPE_LABEL_KEY: Record<PostType, string> = {
  text: 'community.textPost',
  location: 'community.shareLocation',
  image: 'community.shareImage',
  help_request: 'community.helpRequest',
};

export default function CommunityScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const isGuest = useAuthStore((state) => state.isGuest);
  const surakshakUser = useAuthStore((state) => state.surakshakUser);
  const city = surakshakUser?.city ?? '';
  const state = surakshakUser?.state ?? '';

  const {
    posts,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    activeTab,
    setActiveTab,
    refresh,
    createPost,
    reportPost,
    deletePost,
    currentUserId,
    loadMore,
    uploadImage,
  } = useCommunity();

  const [composeOpen, setComposeOpen] = useState(false);
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [postType, setPostType] = useState<PostType>('text');
  const [locationUrl, setLocationUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const closeCompose = (): void => {
    setComposeOpen(false);
    setContent('');
    setIsAnonymous(false);
    setPostType('text');
    setLocationUrl(null);
    setImageUrl(null);
  };

  const handleAttachLocation = async (): Promise<void> => {
    try {
      const fix = await getCurrentLocation();
      setLocationUrl(getLocationUrl(fix.latitude, fix.longitude));
      setImageUrl(null);
      setPostType('location');
    } catch (e) {
      captureException(e);
      Alert.alert(t('errors.locationPermissionDenied'));
    }
  };

  const handleAttachImage = async (): Promise<void> => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: COMMUNITY_IMAGE_ASPECT,
      quality: APP_CONFIG.COMMUNITY_IMAGE_QUALITY,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset === undefined) return;

    setIsUploading(true);
    try {
      const url = await uploadImage(asset.uri);
      setImageUrl(url);
      setLocationUrl(null);
      setPostType('image');
    } catch (e) {
      captureException(e);
      Alert.alert(t('errors.uploadFailed'));
    } finally {
      setIsUploading(false);
    }
  };

  const selectType = (type: PostType): void => {
    if (type === 'location') {
      void handleAttachLocation();
      return;
    }
    if (type === 'image') {
      void handleAttachImage();
      return;
    }
    setLocationUrl(null);
    setImageUrl(null);
    setPostType(type);
  };

  const handleSubmit = async (): Promise<void> => {
    const input: CreatePostInput = {
      content: content.trim(),
      type: postType,
      isAnonymous,
      city,
      state,
      ...(postType === 'location' && locationUrl !== null ? { locationUrl } : {}),
      ...(postType === 'image' && imageUrl !== null ? { imageUrl } : {}),
    };

    setIsPosting(true);
    try {
      await createPost(input);
      closeCompose();
    } catch (e) {
      captureException(e);
      Alert.alert(t('errors.generic'));
    } finally {
      setIsPosting(false);
    }
  };

  const handleReportPress = (postId: string): void => {
    if (isGuest || currentUserId === null) {
      Alert.alert(t('community.guestPrompt'));
      return;
    }
    Alert.alert(t('community.reportConfirmTitle'), t('community.reportConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('community.reportAction'),
        style: 'destructive',
        onPress: (): void => {
          void reportPost(postId)
            .then(() => Alert.alert(t('community.reported')))
            .catch((e: unknown) => {
              captureException(e);
              Alert.alert(t('errors.generic'));
            });
        },
      },
    ]);
  };

  const handleDeletePress = (post: CommunityPost): void => {
    Alert.alert(t('community.deleteConfirmTitle'), t('community.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('community.deletePost'),
        style: 'destructive',
        onPress: (): void => {
          void deletePost(post).catch((e: unknown) => {
            captureException(e);
            Alert.alert(t('community.deleteFailed'));
          });
        },
      },
    ]);
  };

  const openAttachedLocation = (): void => {
    if (locationUrl === null) return;
    Linking.openURL(locationUrl).catch((e: unknown) => captureException(e));
  };

  function renderBody(): React.JSX.Element {
    if (isGuest) {
      return (
        <View className="mt-4 flex-1">
          <GuestBanner message={t('community.guestPrompt')} />
          <EmptyState
            icon="chatbubbles-outline"
            title={t('community.noMessages')}
            subtitle={t('community.beFirst')}
          />
        </View>
      );
    }

    if (error !== null) {
      return (
        <EmptyState
          icon="alert-circle-outline"
          title={t('community.loadError')}
          actionLabel={t('common.retry')}
          onAction={refresh}
        />
      );
    }

    if (isLoading) {
      return <Spinner size="lg" className="flex-1 items-center justify-center" />;
    }

    return (
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            isGuest={isGuest}
            isOwn={currentUserId !== null && item.authorId === currentUserId}
            onReport={handleReportPress}
            onDelete={handleDeletePress}
            onOpenImage={setViewerUri}
          />
        )}
        onEndReached={() => {
          void loadMore();
        }}
        onEndReachedThreshold={0.5}
        contentContainerClassName="pb-24 pt-3"
        ListEmptyComponent={
          <EmptyState
            icon="chatbubbles-outline"
            title={t('community.noMessages')}
            subtitle={t('community.beFirst')}
          />
        }
        ListFooterComponent={
          isLoadingMore ? (
            <Spinner className="py-4" />
          ) : !hasMore && posts.length > 0 ? (
            <Text variant="caption" className="py-4 text-center">
              {t('community.caughtUp')}
            </Text>
          ) : null
        }
      />
    );
  }

  return (
    <ErrorBoundary>
      <SafeScreen>
        <View className="border-b border-stone/20 pb-2">
          <Text variant="h2" tKey="community.title" className="mt-2" />
          {city.length > 0 && <Text variant="caption">{city}</Text>}
          <View className="mt-2 flex-row">
            {TABS.map((tab) => {
              const selected = tab === activeTab;
              return (
                <Pressable
                  key={tab}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setActiveTab(tab)}
                  className={`flex-1 items-center py-2 ${
                    selected ? 'border-b-2 border-shakti-purple' : ''
                  }`}
                >
                  <Text variant="label" className={selected ? 'text-shakti-purple' : ''}>
                    {t(tab === 'city' ? 'community.myCity' : 'community.allIndia')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {renderBody()}

        {!isGuest && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('community.compose')}
            onPress={() => setComposeOpen(true)}
            className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded-full bg-primary-red shadow-lg"
          >
            <MaterialIcons name="add" size={ICON_SIZE.PERMISSION} color={COLORS.WHITE} />
          </Pressable>
        )}

        <BottomSheet visible={composeOpen} onClose={closeCompose}>
          <Text variant="h2" tKey="community.compose" className="mb-3" />

          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text variant="label" tKey="community.anonymous" />
              <Text variant="caption">
                {t(isAnonymous ? 'community.anonymousOn' : 'community.anonymousOff')}
              </Text>
            </View>
            <Switch
              value={isAnonymous}
              onValueChange={setIsAnonymous}
              trackColor={{ true: COLORS.SHAKTI_PURPLE, false: COLORS.STONE }}
            />
          </View>

          <View className="mt-4 flex-row gap-3">
            {(Object.keys(TYPE_ICON) as PostType[]).map((type) => {
              const selected = postType === type;
              return (
                <Pressable
                  key={type}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={t(TYPE_LABEL_KEY[type])}
                  onPress={() => selectType(type)}
                  className={`rounded-xl p-3 ${selected ? 'bg-shakti-purple' : 'bg-stone/10'}`}
                >
                  <MaterialIcons
                    name={TYPE_ICON[type]}
                    size={ICON_SIZE.ROW}
                    color={selected ? COLORS.WHITE : COLORS.STONE}
                  />
                </Pressable>
              );
            })}
          </View>

          {isUploading && (
            <Text variant="caption" className="mt-3" tKey="community.uploadingImage" />
          )}
          {imageUrl !== null && (
            <Image source={{ uri: imageUrl }} className="mt-3 h-24 w-24 rounded-lg" />
          )}
          {locationUrl !== null && (
            <Pressable
              accessibilityRole="link"
              onPress={openAttachedLocation}
              className="mt-3 flex-row items-center gap-1 self-start"
            >
              <MaterialIcons name="place" size={ICON_SIZE.ROW} color={COLORS.SHAKTI_PURPLE} />
              <Text variant="caption" className="text-shakti-purple" tKey="community.viewOnMap" />
            </Pressable>
          )}

          <TextInput
            multiline
            maxLength={APP_CONFIG.COMMUNITY_POST_MAX_LENGTH}
            placeholder={t('community.typeMessage')}
            placeholderTextColor={colors.textSecondary}
            value={content}
            onChangeText={setContent}
            className="mt-3 min-h-24 rounded-xl border border-stone/30 bg-white p-3 text-base text-ink dark:border-dark-border dark:bg-charcoal dark:text-white"
          />
          <Text variant="caption" className="mt-1 self-end">
            {t('community.charCount', {
              count: content.length,
              max: APP_CONFIG.COMMUNITY_POST_MAX_LENGTH,
            })}
          </Text>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            className="mt-3"
            label={t('community.post')}
            loading={isPosting}
            disabled={content.trim().length === 0 || isUploading}
            onPress={() => {
              void handleSubmit();
            }}
          />
          <Button
            variant="ghost"
            size="md"
            fullWidth
            className="mt-2"
            label={t('common.cancel')}
            onPress={closeCompose}
          />
        </BottomSheet>

        <ImageViewer uri={viewerUri} onClose={() => setViewerUri(null)} />
      </SafeScreen>
    </ErrorBoundary>
  );
}
