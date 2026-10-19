import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { captureException } from '@/config/sentry';
import { APP_CONFIG } from '@/constants/config';
import {
  trackCommunityHelpRequested,
  trackCommunityImageShared,
  trackCommunityLocationShared,
  trackCommunityPostCreated,
  trackCommunityPostReported,
  trackCommunityTabSwitched,
} from '@/services/analytics.service';
import {
  createPost as createPostService,
  deletePost as deletePostService,
  loadMoreAllIndiaPosts,
  loadMoreCityPosts,
  reportPost as reportPostService,
  subscribeToAllIndiaPosts,
  subscribeToCityPosts,
  uploadPostImage,
} from '@/services/firebase/community.service';
import { useAuthStore } from '@/stores/auth.store';
import type { CommunityPost, CommunityTab, CreatePostInput } from '@/types/community.types';

export interface UseCommunityResult {
  posts: CommunityPost[];
  isLoading: boolean;
  isLoadingMore: boolean;
  /** An i18n key for the current error, or `null`. */
  error: string | null;
  hasMore: boolean;
  activeTab: CommunityTab;
  setActiveTab: (tab: CommunityTab) => void;
  refresh: () => void;
  createPost: (input: CreatePostInput) => Promise<string>;
  reportPost: (postId: string, reason?: string) => Promise<void>;
  /** Deletes one of the signed-in user's own posts. */
  deletePost: (post: CommunityPost) => Promise<void>;
  /** The signed-in user's id, to tell which posts are theirs. */
  currentUserId: string | null;
  loadMore: () => Promise<void>;
  uploadImage: (localUri: string) => Promise<string>;
}

interface FeedState {
  /** `activeTab|city|nonce` the head/tail belong to. */
  key: string;
  head: CommunityPost[];
  tail: CommunityPost[];
  hasMore: boolean;
  loaded: boolean;
  /** An i18n key for a load failure on this key, or `null`. */
  error: string | null;
}

const EMPTY: CommunityPost[] = [];

const INITIAL_FEED: FeedState = {
  key: '',
  head: [],
  tail: [],
  hasMore: true,
  loaded: false,
  error: null,
};

/** Owns the community feed: realtime first page, paged tail, and post actions. */
export function useCommunity(): UseCommunityResult {
  const surakshakUser = useAuthStore((state) => state.surakshakUser);
  const isGuest = useAuthStore((state) => state.isGuest);

  const userId = surakshakUser?.userId ?? null;
  const city = surakshakUser?.city ?? '';
  const authorName = surakshakUser?.name ?? '';
  const authorPhotoUrl = surakshakUser?.profilePhotoUrl ?? '';

  const [activeTab, setActiveTabState] = useState<CommunityTab>('city');
  const [nonce, setNonce] = useState(0);
  const [feed, setFeed] = useState<FeedState>(INITIAL_FEED);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const unsubscribeRef = useRef<(() => void) | null>(null);

  const currentKey = `${activeTab}|${city}|${nonce}`;
  const onCurrentKey = feed.key === currentKey;
  const canFeed = userId !== null && !isGuest;

  const headPosts = onCurrentKey ? feed.head : EMPTY;
  const tailPosts = onCurrentKey ? feed.tail : EMPTY;
  const isLoading = canFeed && !(onCurrentKey && feed.loaded);
  const hasMore = onCurrentKey ? feed.hasMore : true;
  const error = onCurrentKey ? feed.error : null;

  const posts = useMemo<CommunityPost[]>(() => {
    const seen = new Set<string>();
    const merged: CommunityPost[] = [];
    for (const post of [...headPosts, ...tailPosts]) {
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      merged.push(post);
    }
    return merged;
  }, [headPosts, tailPosts]);

  useEffect(() => {
    if (userId === null || isGuest) return;

    const key = `${activeTab}|${city}|${nonce}`;
    const onUpdate = (next: CommunityPost[]): void => {
      setFeed((prev) => ({
        key,
        head: next,
        tail: prev.key === key ? prev.tail : [],
        hasMore: next.length >= APP_CONFIG.COMMUNITY_PAGE_SIZE,
        loaded: true,
        error: null,
      }));
    };
    const onError = (err: Error): void => {
      captureException(err);
      setFeed({
        key,
        head: [],
        tail: [],
        hasMore: false,
        loaded: true,
        error: 'community.loadError',
      });
    };

    unsubscribeRef.current =
      activeTab === 'city'
        ? subscribeToCityPosts(city, onUpdate, onError)
        : subscribeToAllIndiaPosts(onUpdate, onError);

    return (): void => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [activeTab, city, nonce, userId, isGuest]);

  const setActiveTab = useCallback((tab: CommunityTab): void => {
    setActiveTabState(tab);
    trackCommunityTabSwitched(tab);
  }, []);

  const refresh = useCallback((): void => {
    setNonce((current) => current + 1);
  }, []);

  const loadMore = useCallback(async (): Promise<void> => {
    if (isLoadingMore || !hasMore) return;
    if (posts.length >= APP_CONFIG.COMMUNITY_FEED_LIMIT) return;
    const last = posts[posts.length - 1];
    if (last === undefined) return;

    const key = currentKey;
    setIsLoadingMore(true);
    try {
      const older =
        activeTab === 'city'
          ? await loadMoreCityPosts(city, last.createdAt)
          : await loadMoreAllIndiaPosts(last.createdAt);
      setFeed((prev) =>
        prev.key === key
          ? {
              ...prev,
              tail: [...prev.tail, ...older],
              hasMore: older.length >= APP_CONFIG.COMMUNITY_PAGE_SIZE,
            }
          : prev,
      );
    } catch (err) {
      captureException(err);
      setFeed((prev) => (prev.key === key ? { ...prev, error: 'community.loadError' } : prev));
    } finally {
      setIsLoadingMore(false);
    }
  }, [activeTab, city, currentKey, hasMore, isLoadingMore, posts]);

  const createPost = useCallback(
    async (input: CreatePostInput): Promise<string> => {
      if (userId === null) throw new Error('errors.generic');
      const id = await createPostService(userId, authorName, authorPhotoUrl, input);
      trackCommunityPostCreated(input.type, input.isAnonymous);
      if (input.type === 'help_request') trackCommunityHelpRequested();
      if (input.locationUrl !== undefined) trackCommunityLocationShared();
      if (input.imageUrl !== undefined) trackCommunityImageShared();
      return id;
    },
    [userId, authorName, authorPhotoUrl],
  );

  const reportPost = useCallback(
    async (postId: string, reason?: string): Promise<void> => {
      if (userId === null || isGuest) throw new Error('errors.generic');
      await reportPostService(postId, userId, reason);
      trackCommunityPostReported();
    },
    [userId, isGuest],
  );

  const deletePost = useCallback(async (post: CommunityPost): Promise<void> => {
    await deletePostService(post);
    // The live head drops it on the next snapshot; older loaded pages don't.
    setFeed((prev) => ({
      ...prev,
      head: prev.head.filter((item) => item.id !== post.id),
      tail: prev.tail.filter((item) => item.id !== post.id),
    }));
  }, []);

  const uploadImage = useCallback(
    async (localUri: string): Promise<string> => {
      if (userId === null) throw new Error('errors.generic');
      return uploadPostImage(userId, localUri);
    },
    [userId],
  );

  return {
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
    currentUserId: userId,
    loadMore,
    uploadImage,
  };
}
