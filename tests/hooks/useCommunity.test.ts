import { act, renderHook } from '@testing-library/react-native';

import { useCommunity } from '@/hooks/useCommunity';
import {
  trackCommunityHelpRequested,
  trackCommunityPostCreated,
  trackCommunityPostReported,
  trackCommunityTabSwitched,
} from '@/services/analytics.service';
import {
  createPost as createPostService,
  loadMoreCityPosts,
  reportPost as reportPostService,
  subscribeToAllIndiaPosts,
  subscribeToCityPosts,
} from '@/services/firebase/community.service';
import { useAuthStore } from '@/stores/auth.store';
import type { CommunityPost } from '@/types/community.types';

jest.mock('@/services/analytics.service');
jest.mock('@/services/firebase/community.service', () => ({
  subscribeToCityPosts: jest.fn(() => jest.fn()),
  subscribeToAllIndiaPosts: jest.fn(() => jest.fn()),
  createPost: jest.fn(() => Promise.resolve('post-1')),
  reportPost: jest.fn(() => Promise.resolve()),
  uploadPostImage: jest.fn(() => Promise.resolve('https://cdn/x.jpg')),
  loadMoreCityPosts: jest.fn(() => Promise.resolve([])),
  loadMoreAllIndiaPosts: jest.fn(() => Promise.resolve([])),
}));

const authState = useAuthStore.getState();

const SEED_USER = {
  userId: 'u1',
  name: 'Asha',
  phone: '9000000000',
  profilePhotoUrl: 'https://p/a.jpg',
  city: 'Mumbai',
  state: 'MH',
  language: 'en' as const,
  isGuest: false,
  createdAt: null as never,
  updatedAt: null as never,
};

function makePost(id: string): CommunityPost {
  return {
    id,
    authorId: 'u2',
    authorName: 'Bina',
    authorPhotoUrl: '',
    content: `post ${id}`,
    type: 'text',
    isAnonymous: false,
    locationUrl: null,
    imageUrl: null,
    city: 'Mumbai',
    state: 'MH',
    reportCount: 0,
    isHidden: false,
    createdAt: { toDate: () => new Date() } as never,
  };
}

let cityOnUpdate: ((posts: CommunityPost[]) => void) | undefined;
let cityOnError: ((error: Error) => void) | undefined;
let cityUnsub: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  cityOnUpdate = undefined;
  cityOnError = undefined;
  cityUnsub = jest.fn();
  jest.mocked(subscribeToCityPosts).mockImplementation((_city, onUpdate, onError) => {
    cityOnUpdate = onUpdate;
    cityOnError = onError;
    return cityUnsub;
  });
  jest.mocked(subscribeToAllIndiaPosts).mockImplementation(() => jest.fn());
  useAuthStore.setState({ ...authState, surakshakUser: SEED_USER, isGuest: false });
});

describe('useCommunity', () => {
  it('subscribes to the city feed on mount and surfaces pushed posts', async () => {
    const { result } = await renderHook(() => useCommunity());

    expect(subscribeToCityPosts).toHaveBeenCalledWith(
      'Mumbai',
      expect.any(Function),
      expect.any(Function),
    );

    await act(() => {
      cityOnUpdate?.([makePost('p1')]);
    });

    expect(result.current.posts).toHaveLength(1);
    expect(result.current.isLoading).toBe(false);
  });

  it('switches to the All-India listener and tears down the city one', async () => {
    const { result } = await renderHook(() => useCommunity());

    await act(() => {
      result.current.setActiveTab('all_india');
    });

    expect(cityUnsub).toHaveBeenCalled();
    expect(subscribeToAllIndiaPosts).toHaveBeenCalled();
    expect(result.current.activeTab).toBe('all_india');
    expect(trackCommunityTabSwitched).toHaveBeenCalledWith('all_india');
  });

  it('surfaces a listener error and stops loading', async () => {
    const { result } = await renderHook(() => useCommunity());

    await act(() => {
      cityOnError?.(new Error('failed-precondition'));
    });

    expect(result.current.error).toBe('community.loadError');
    expect(result.current.isLoading).toBe(false);
  });

  it('does not subscribe for a guest', async () => {
    useAuthStore.setState({ ...authState, surakshakUser: null, isGuest: true });

    const { result } = await renderHook(() => useCommunity());

    expect(subscribeToCityPosts).not.toHaveBeenCalled();
    expect(result.current.posts).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('createPost delegates with the author identity and tracks the event', async () => {
    const { result } = await renderHook(() => useCommunity());

    await act(async () => {
      await result.current.createPost({
        content: 'hi',
        type: 'text',
        isAnonymous: false,
        city: 'Mumbai',
        state: 'MH',
      });
    });

    expect(createPostService).toHaveBeenCalledWith(
      'u1',
      'Asha',
      'https://p/a.jpg',
      expect.objectContaining({ content: 'hi' }),
    );
    expect(trackCommunityPostCreated).toHaveBeenCalledWith('text', false);
  });

  it('createPost fires the help-request event for a help post', async () => {
    const { result } = await renderHook(() => useCommunity());

    await act(async () => {
      await result.current.createPost({
        content: 'need help',
        type: 'help_request',
        isAnonymous: false,
        city: 'Mumbai',
        state: 'MH',
      });
    });

    expect(trackCommunityHelpRequested).toHaveBeenCalled();
  });

  it('reportPost delegates with userId and tracks', async () => {
    const { result } = await renderHook(() => useCommunity());

    await act(async () => {
      await result.current.reportPost('p9');
    });

    expect(reportPostService).toHaveBeenCalledWith('p9', 'u1', undefined);
    expect(trackCommunityPostReported).toHaveBeenCalled();
  });

  it('reportPost rejects when user is not authenticated or is a guest', async () => {
    useAuthStore.setState({ ...authState, surakshakUser: null, isGuest: true });
    const { result } = await renderHook(() => useCommunity());

    await expect(result.current.reportPost('p9')).rejects.toThrow('errors.generic');
  });

  it('loadMore appends the next page and keeps paginating on a full page', async () => {
    jest
      .mocked(loadMoreCityPosts)
      .mockResolvedValueOnce(Array.from({ length: 20 }, (_, i) => makePost(`t${i}`)));

    const { result } = await renderHook(() => useCommunity());
    await act(() => {
      cityOnUpdate?.(Array.from({ length: 20 }, (_, i) => makePost(`h${i}`)));
    });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(loadMoreCityPosts).toHaveBeenCalledWith('Mumbai', expect.anything());
    expect(result.current.posts).toHaveLength(40);
    expect(result.current.hasMore).toBe(true);
  });

  it('loadMore stops paginating when a short page returns', async () => {
    jest.mocked(loadMoreCityPosts).mockResolvedValueOnce([makePost('t0')]);

    const { result } = await renderHook(() => useCommunity());
    await act(() => {
      cityOnUpdate?.(Array.from({ length: 20 }, (_, i) => makePost(`h${i}`)));
    });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.posts).toHaveLength(21);
    expect(result.current.hasMore).toBe(false);
  });

  it('tears down the listener on unmount', async () => {
    const { unmount } = await renderHook(() => useCommunity());
    await unmount();
    expect(cityUnsub).toHaveBeenCalled();
  });
});
