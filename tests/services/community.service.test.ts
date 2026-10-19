import {
  addDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  setDoc,
  startAfter,
  updateDoc,
  where,
} from '@react-native-firebase/firestore';
import { deleteObject, getDownloadURL, putFile, ref } from '@react-native-firebase/storage';

import {
  createPost,
  deletePost,
  loadMoreAllIndiaPosts,
  loadMoreCityPosts,
  reportPost,
  subscribeToAllIndiaPosts,
  subscribeToCityPosts,
  uploadPostImage,
} from '@/services/firebase/community.service';
import type { CreatePostInput } from '@/types/community.types';

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  collection: jest.fn((...segments: string[]) => ({ path: segments.join('/') })),
  doc: jest.fn((...segments: string[]) => ({ path: segments.join('/') })),
  addDoc: jest.fn(() => Promise.resolve({ id: 'post-1' })),
  deleteDoc: jest.fn(() => Promise.resolve()),
  getDoc: jest.fn(),
  getDocs: jest.fn(() => Promise.resolve({ docs: [] })),
  setDoc: jest.fn(() => Promise.resolve()),
  updateDoc: jest.fn(() => Promise.resolve()),
  query: jest.fn((ref: unknown) => ref),
  where: jest.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  orderBy: jest.fn((field: string, dir: string) => ({ orderBy: field, dir })),
  limit: jest.fn((n: number) => ({ limit: n })),
  startAfter: jest.fn((cursor: unknown) => ({ startAfter: cursor })),
  onSnapshot: jest.fn(() => jest.fn()),
  serverTimestamp: jest.fn(() => ({ __serverTimestamp: true })),
  increment: jest.fn((n: number) => ({ __increment: n })),
}));

const NAMED_INPUT: CreatePostInput = {
  content: 'hello city',
  type: 'text',
  isAnonymous: false,
  city: 'Mumbai',
  state: 'MH',
};

describe('community.service', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => errorSpy.mockRestore());

  it('createPost writes reportCount:0 / isHidden:false with the author identity', async () => {
    const id = await createPost('u1', 'Asha', 'https://p/a.jpg', NAMED_INPUT);

    expect(id).toBe('post-1');
    const payload = jest.mocked(addDoc).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).toMatchObject({
      authorId: 'u1',
      authorName: 'Asha',
      authorPhotoUrl: 'https://p/a.jpg',
      content: 'hello city',
      type: 'text',
      isAnonymous: false,
      locationUrl: null,
      imageUrl: null,
      city: 'Mumbai',
      state: 'MH',
      reportCount: 0,
      isHidden: false,
      createdAt: { __serverTimestamp: true },
    });
  });

  it('createPost strips the author name and photo for an anonymous post', async () => {
    await createPost('u1', 'Asha', 'https://p/a.jpg', { ...NAMED_INPUT, isAnonymous: true });

    const payload = jest.mocked(addDoc).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).toMatchObject({ authorName: '', authorPhotoUrl: '', isAnonymous: true });
  });

  it('createPost persists an attached location and image url', async () => {
    await createPost('u1', 'Asha', 'https://p/a.jpg', {
      ...NAMED_INPUT,
      type: 'location',
      locationUrl: 'https://maps/x',
      imageUrl: 'https://img/x',
    });

    const payload = jest.mocked(addDoc).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).toMatchObject({ locationUrl: 'https://maps/x', imageUrl: 'https://img/x' });
  });

  it('records a new report under subcollection and increments reportCount without mutating isHidden', async () => {
    jest.mocked(getDoc).mockResolvedValueOnce({ exists: () => false } as never);

    await reportPost('post-1', 'user-1', 'harassment');

    expect(setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining('community/post-1/reports/user-1') }),
      {
        reporterId: 'user-1',
        postId: 'post-1',
        reason: 'harassment',
        createdAt: { __serverTimestamp: true },
      },
    );
    expect(updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining('community/post-1') }),
      {
        reportCount: { __increment: 1 },
      },
    );
    expect(updateDoc).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isHidden: expect.anything() }),
    );
  });

  it('skips duplicate report and does not increment reportCount if already reported by user', async () => {
    jest.mocked(getDoc).mockResolvedValueOnce({ exists: () => true } as never);

    await reportPost('post-1', 'user-1');

    expect(setDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('throws when reporterId is empty or not provided', async () => {
    await expect(reportPost('post-1', '')).rejects.toThrow('Reporter ID is required');
  });

  it('uploadPostImage stores under community/{userId}/{timestamp}.jpg and returns the URL', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    jest.mocked(getDownloadURL).mockResolvedValueOnce('https://cdn/x.jpg');

    const url = await uploadPostImage('u1', 'file:///x.jpg');

    expect(ref).toHaveBeenCalledWith(expect.anything(), 'community/u1/1700000000000.jpg');
    expect(putFile).toHaveBeenCalledWith(expect.anything(), 'file:///x.jpg', {
      contentType: 'image/jpeg',
    });
    expect(url).toBe('https://cdn/x.jpg');
    nowSpy.mockRestore();
  });

  it('deletePost removes the post and its image', async () => {
    await deletePost({ id: 'p1', imageUrl: 'https://cdn/x.jpg' });

    expect(deleteDoc).toHaveBeenCalledWith({ path: expect.stringContaining('community/p1') });
    expect(ref).toHaveBeenCalledWith(expect.anything(), 'https://cdn/x.jpg');
    expect(deleteObject).toHaveBeenCalled();
  });

  it('deletePost skips storage for a post without an image', async () => {
    await deletePost({ id: 'p1', imageUrl: null });

    expect(deleteDoc).toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('deletePost still succeeds when the image cannot be removed', async () => {
    jest.mocked(deleteObject).mockRejectedValueOnce(new Error('not found'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(deletePost({ id: 'p1', imageUrl: 'https://cdn/x.jpg' })).resolves.toBeUndefined();
    warnSpy.mockRestore();
  });

  it('deletePost rethrows when the post itself cannot be deleted', async () => {
    jest.mocked(deleteDoc).mockRejectedValueOnce(new Error('permission-denied'));

    await expect(deletePost({ id: 'p1', imageUrl: null })).rejects.toThrow('permission-denied');
  });

  it('maps a just-created post with estimated server timestamps', () => {
    const data = jest.fn(() => ({ content: 'a', createdAt: { toDate: () => new Date() } }));
    jest.mocked(onSnapshot).mockImplementationOnce((_query, next) => {
      (next as (snap: unknown) => void)({ docs: [{ id: 'p1', data }] });
      return jest.fn();
    });

    subscribeToAllIndiaPosts(jest.fn());

    expect(data).toHaveBeenCalledWith({ serverTimestamps: 'estimate' });
  });

  it('subscribeToCityPosts filters, orders, limits and maps the snapshot', () => {
    jest.mocked(onSnapshot).mockImplementationOnce((_query, next) => {
      (next as (snap: unknown) => void)({
        docs: [{ id: 'p1', data: () => ({ content: 'a' }) }],
      });
      return jest.fn();
    });

    const onUpdate = jest.fn();
    const unsubscribe = subscribeToCityPosts('Mumbai', onUpdate);

    expect(where).toHaveBeenCalledWith('city', '==', 'Mumbai');
    expect(where).toHaveBeenCalledWith('isHidden', '==', false);
    expect(orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(onUpdate).toHaveBeenCalledWith([{ id: 'p1', content: 'a' }]);
    expect(typeof unsubscribe).toBe('function');
  });

  it('subscribeToAllIndiaPosts omits the city filter', () => {
    jest.mocked(onSnapshot).mockImplementationOnce(() => jest.fn());

    subscribeToAllIndiaPosts(jest.fn());

    expect(where).not.toHaveBeenCalledWith('city', '==', expect.anything());
  });

  it('ignores a null snapshot instead of throwing (listener error / index building)', () => {
    jest.mocked(onSnapshot).mockImplementationOnce((_query, next) => {
      (next as (snap: unknown) => void)(null);
      return jest.fn();
    });

    const onUpdate = jest.fn();
    expect(() => subscribeToCityPosts('Mumbai', onUpdate)).not.toThrow();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('forwards a listener error to the onError callback', () => {
    const failure = new Error('failed-precondition: index not ready');
    jest.mocked(onSnapshot).mockImplementationOnce((_query, _next, onError) => {
      (onError as unknown as (error: Error) => void)(failure);
      return jest.fn();
    });

    const onErrorSpy = jest.fn();
    subscribeToCityPosts('Mumbai', jest.fn(), onErrorSpy);

    expect(onErrorSpy).toHaveBeenCalledWith(failure);
  });

  it('loadMoreCityPosts pages after the cursor timestamp', async () => {
    jest.mocked(getDocs).mockResolvedValueOnce({
      docs: [{ id: 'p2', data: () => ({ content: 'b' }) }],
    } as never);
    const cursor = { seconds: 1, nanoseconds: 0 } as never;

    const older = await loadMoreCityPosts('Mumbai', cursor);

    expect(startAfter).toHaveBeenCalledWith(cursor);
    expect(older).toEqual([{ id: 'p2', content: 'b' }]);
  });

  it('loadMoreAllIndiaPosts pages without a city filter', async () => {
    jest.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as never);

    await loadMoreAllIndiaPosts({ seconds: 2, nanoseconds: 0 } as never);

    expect(where).not.toHaveBeenCalledWith('city', '==', expect.anything());
  });

  it.each([
    ['createPost', (): Promise<unknown> => createPost('u1', 'Asha', 'p', NAMED_INPUT)],
    ['reportPost', (): Promise<unknown> => reportPost('post-1', 'u1')],
    ['loadMoreCityPosts', (): Promise<unknown> => loadMoreCityPosts('Mumbai', {} as never)],
    ['loadMoreAllIndiaPosts', (): Promise<unknown> => loadMoreAllIndiaPosts({} as never)],
    ['uploadPostImage', (): Promise<unknown> => uploadPostImage('u1', 'file:///x.jpg')],
  ])('%s logs and rethrows when the backend fails', async (_name, call) => {
    jest.mocked(addDoc).mockRejectedValueOnce(new Error('offline'));
    jest.mocked(getDoc).mockRejectedValueOnce(new Error('offline'));
    jest.mocked(getDocs).mockRejectedValueOnce(new Error('offline'));
    jest.mocked(putFile).mockRejectedValueOnce(new Error('offline') as never);

    await expect(call()).rejects.toThrow('offline');
    expect(errorSpy).toHaveBeenCalled();
  });
});
