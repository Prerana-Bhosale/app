import { addDoc, getDocs, orderBy, where } from '@react-native-firebase/firestore';
import { putFile, ref } from '@react-native-firebase/storage';

import {
  getMyIncidentReports,
  submitIncidentReport,
  uploadEvidenceRecording,
  uploadIncidentPhoto,
} from '@/services/firebase/incident.service';

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  collection: jest.fn(() => ({})),
  addDoc: jest.fn(() => Promise.resolve({ id: 'incident-1' })),
  getDocs: jest.fn(() => Promise.resolve({ docs: [] })),
  query: jest.fn((ref: unknown) => ref),
  where: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  limit: jest.fn(() => ({})),
  serverTimestamp: jest.fn(() => ({ __serverTimestamp: true })),
  Timestamp: { now: jest.fn(() => ({ __now: true })), fromDate: jest.fn((date: Date) => date) },
}));

interface MockTask extends Promise<void> {
  on: jest.Mock;
}

type ProgressListener = (snapshot: { bytesTransferred: number; totalBytes: number }) => void;

/** A `putFile` stand-in that, when `.on('state_changed', listener)` is
 * called, immediately invokes `listener` once with a fixed snapshot. */
function mockTask(): MockTask {
  const task = Promise.resolve() as MockTask;
  task.on = jest.fn((_event: string, listener: ProgressListener) => {
    listener({ bytesTransferred: 50, totalBytes: 100 });
  });
  return task;
}

jest.mock('@react-native-firebase/storage', () => ({
  getStorage: jest.fn(() => ({})),
  ref: jest.fn(() => ({})),
  putFile: jest.fn(),
  getDownloadURL: jest.fn(() => Promise.resolve('https://example.com/file.jpg')),
}));

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.mocked(putFile).mockReturnValue(mockTask() as never);
});

afterEach(() => errorSpy.mockRestore());

describe('submitIncidentReport', () => {
  it('writes the report with status "submitted" and a serverTimestamp createdAt', async () => {
    await submitIncidentReport('user-1', {
      title: 'Followed',
      description: 'Followed near the station',
      latitude: 19.076,
      longitude: 72.8777,
      photoUrls: ['https://example.com/1.jpg'],
    });

    expect(jest.mocked(addDoc).mock.calls[0]?.[1]).toMatchObject({
      userId: 'user-1',
      title: 'Followed',
      description: 'Followed near the station',
      latitude: 19.076,
      longitude: 72.8777,
      photoUrls: ['https://example.com/1.jpg'],
      status: 'submitted',
      createdAt: { __serverTimestamp: true },
    });
  });

  it('returns the created report with its new id', async () => {
    const result = await submitIncidentReport('user-1', {
      title: 'Followed',
      description: 'Followed near the station',
      latitude: 19.076,
      longitude: 72.8777,
      photoUrls: [],
    });

    expect(result.id).toBe('incident-1');
    expect(result.status).toBe('submitted');
  });

  it('logs and rethrows when Firestore fails', async () => {
    jest.mocked(addDoc).mockRejectedValueOnce(new Error('offline'));
    await expect(
      submitIncidentReport('user-1', {
        title: 'Followed',
        description: 'Followed near the station',
        latitude: 19.076,
        longitude: 72.8777,
        photoUrls: [],
      }),
    ).rejects.toThrow('offline');
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('getMyIncidentReports', () => {
  it('orders by createdAt descending', async () => {
    await getMyIncidentReports('user-1');
    expect(where).toHaveBeenCalledWith('userId', '==', 'user-1');
    expect(orderBy).toHaveBeenCalledWith('createdAt', 'desc');
  });

  it('maps each document to an IncidentReport with its id', async () => {
    jest.mocked(getDocs).mockResolvedValueOnce({
      docs: [
        { id: 'r1', data: () => ({ userId: 'user-1', title: 'A', status: 'submitted' }) },
        { id: 'r2', data: () => ({ userId: 'user-1', title: 'B', status: 'resolved' }) },
      ],
    } as never);

    const reports = await getMyIncidentReports('user-1');
    expect(reports.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(reports[1]?.status).toBe('resolved');
  });

  it('falls back to photos field when photoUrls is not present', async () => {
    jest.mocked(getDocs).mockResolvedValueOnce({
      docs: [
        {
          id: 'r3',
          data: () => ({
            userId: 'user-1',
            title: 'Legacy',
            status: 'submitted',
            photos: ['https://cdn/legacy.jpg'],
          }),
        },
      ],
    } as never);

    const reports = await getMyIncidentReports('user-1');
    expect(reports[0]?.photoUrls).toEqual(['https://cdn/legacy.jpg']);
  });

  it('logs and rethrows when Firestore fails', async () => {
    jest.mocked(getDocs).mockRejectedValueOnce(new Error('offline'));
    await expect(getMyIncidentReports('user-1')).rejects.toThrow('offline');
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('uploadIncidentPhoto', () => {
  it('uploads under incidents/{userId}/ and returns the download URL', async () => {
    const url = await uploadIncidentPhoto('user-1', 'file:///photo.jpg');

    expect(ref).toHaveBeenCalledWith(
      {},
      expect.stringMatching(/^incidents\/user-1\/\d+_\w+\.jpg$/),
    );
    expect(putFile).toHaveBeenCalledWith({}, 'file:///photo.jpg', { contentType: 'image/jpeg' });
    expect(url).toBe('https://example.com/file.jpg');
  });

  it('logs and rethrows when the upload fails', async () => {
    jest.mocked(putFile).mockImplementationOnce(() => {
      throw new Error('storage unavailable');
    });
    await expect(uploadIncidentPhoto('user-1', 'file:///photo.jpg')).rejects.toThrow(
      'storage unavailable',
    );
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('uploadEvidenceRecording', () => {
  it('uploads under evidence/{userId}/{timestamp}.m4a', async () => {
    const url = await uploadEvidenceRecording('user-1', 'file:///rec.m4a');

    expect(ref).toHaveBeenCalledWith({}, expect.stringMatching(/^evidence\/user-1\/\d+\.m4a$/));
    expect(url).toBe('https://example.com/file.jpg');
  });

  it('reports upload progress via the onProgress callback', async () => {
    jest.mocked(putFile).mockReturnValueOnce(mockTask() as never);
    const onProgress = jest.fn();
    await uploadEvidenceRecording('user-1', 'file:///rec.m4a', onProgress);
    expect(onProgress).toHaveBeenCalledWith(50);
  });
});
