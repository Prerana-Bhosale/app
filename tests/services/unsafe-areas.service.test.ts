import {
  addDoc,
  arrayUnion,
  getDoc,
  increment,
  limit,
  onSnapshot,
  updateDoc,
} from '@react-native-firebase/firestore';

import {
  reportUnsafeArea,
  subscribeToUnsafeAreas,
  voteOnUnsafeArea,
} from '@/services/firebase/unsafe-areas.service';

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  collection: jest.fn((...segments: string[]) => ({ path: segments.join('/') })),
  doc: jest.fn((...segments: string[]) => ({ path: segments.join('/') })),
  addDoc: jest.fn(() => Promise.resolve({ id: 'area-1' })),
  getDoc: jest.fn(),
  updateDoc: jest.fn(() => Promise.resolve()),
  query: jest.fn((ref: unknown) => ref),
  orderBy: jest.fn((field: string) => ({ orderBy: field })),
  limit: jest.fn((n: number) => ({ limit: n })),
  onSnapshot: jest.fn((_ref: unknown, cb: (snap: unknown) => void) => {
    cb({ docs: [{ id: 'area-9', data: () => ({ title: 'Dark lane', pinColor: 'orange' }) }] });
    return jest.fn();
  }),
  serverTimestamp: jest.fn(() => ({ __serverTimestamp: true })),
  increment: jest.fn((n: number) => ({ __increment: n })),
  arrayUnion: jest.fn((value: unknown) => ({ __arrayUnion: value })),
}));

describe('unsafe-areas.service', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => errorSpy.mockRestore());

  it('reportUnsafeArea writes a pending, orange-pinned report', async () => {
    const id = await reportUnsafeArea(
      'user-1',
      19.076,
      72.8777,
      'Dark lane',
      'No lights',
      'poorly_lit',
    );

    expect(id).toBe('area-1');
    const payload = jest.mocked(addDoc).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).toMatchObject({
      reportedBy: 'user-1',
      status: 'pending',
      pinColor: 'orange',
      upvotes: 0,
      downvotes: 0,
      voterIds: [],
      category: 'poorly_lit',
    });
  });

  it('subscribeToUnsafeAreas maps snapshot docs and returns an unsubscribe', () => {
    const onUpdate = jest.fn();
    const unsubscribe = subscribeToUnsafeAreas(onUpdate);

    expect(typeof unsubscribe).toBe('function');
    expect(limit).toHaveBeenCalledWith(100);
    expect(onUpdate).toHaveBeenCalledWith([
      { id: 'area-9', title: 'Dark lane', pinColor: 'orange' },
    ]);
  });

  it('subscribeToUnsafeAreas reports error via callback and does not wipe markers on listener error', () => {
    jest.mocked(onSnapshot).mockImplementationOnce(((
      _ref: unknown,
      _cb: (snap: unknown) => void,
      errorCb?: (error: unknown) => void,
    ) => {
      errorCb?.(new Error('permission-denied'));
      return jest.fn();
    }) as never);

    const onUpdate = jest.fn();
    const onError = jest.fn();
    subscribeToUnsafeAreas(onUpdate, onError);

    expect(onUpdate).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(errorSpy).toHaveBeenCalled();
  });

  it('voteOnUnsafeArea increments the vote and records the voter', async () => {
    jest.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      id: 'area-1',
      data: () => ({ voterIds: [] }),
    } as never);

    await voteOnUnsafeArea('area-1', 'user-1', 'up');

    expect(increment).toHaveBeenCalledWith(1);
    expect(arrayUnion).toHaveBeenCalledWith('user-1');
    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), {
      upvotes: { __increment: 1 },
      voterIds: { __arrayUnion: 'user-1' },
    });
  });

  it('voteOnUnsafeArea is a no-op when the user has already voted', async () => {
    jest.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      id: 'area-1',
      data: () => ({ voterIds: ['user-1'] }),
    } as never);

    await voteOnUnsafeArea('area-1', 'user-1', 'down');
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('voteOnUnsafeArea rejects when the area does not exist', async () => {
    jest
      .mocked(getDoc)
      .mockResolvedValueOnce({ exists: () => false, id: 'x', data: () => undefined } as never);
    await expect(voteOnUnsafeArea('missing', 'user-1', 'up')).rejects.toThrow('Area not found');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('reportUnsafeArea logs and rethrows when the write fails', async () => {
    jest.mocked(addDoc).mockRejectedValueOnce(new Error('offline'));
    await expect(reportUnsafeArea('u', 0, 0, 'title', 'description text', 'other')).rejects.toThrow(
      'offline',
    );
    expect(errorSpy).toHaveBeenCalled();
  });
});
