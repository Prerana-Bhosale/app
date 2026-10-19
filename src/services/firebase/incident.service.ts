import {
  Timestamp,
  addDoc,
  collection,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from '@react-native-firebase/firestore';
import { getDownloadURL, putFile, ref } from '@react-native-firebase/storage';

import { firestore, storage } from '@/config/firebase';

interface IncidentReport {
  id: string;
  userId: string;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  photoUrls: string[];
  createdAt: Timestamp;
  status: 'submitted' | 'under_review' | 'resolved';
}

export type { IncidentReport };

const INCIDENTS_COLLECTION = 'incidentReports';
const INCIDENT_HISTORY_LIMIT = 50;

function incidentsCollection(): ReturnType<typeof collection> {
  return collection(firestore, INCIDENTS_COLLECTION);
}

/**
 * Submits an incident report with optional photo evidence. Photos are
 * uploaded to Storage first so the Firestore document only ever holds their
 * download URLs.
 * @phase Phase 7 — Advanced Safety
 */
export async function submitIncidentReport(
  userId: string,
  report: Omit<IncidentReport, 'id' | 'userId' | 'createdAt' | 'status'>,
): Promise<IncidentReport> {
  try {
    const created = await addDoc(incidentsCollection(), {
      userId,
      title: report.title,
      description: report.description,
      latitude: report.latitude,
      longitude: report.longitude,
      photoUrls: report.photoUrls,
      status: 'submitted',
      createdAt: serverTimestamp(),
    });

    return {
      id: created.id,
      userId,
      title: report.title,
      description: report.description,
      latitude: report.latitude,
      longitude: report.longitude,
      photoUrls: report.photoUrls,
      status: 'submitted',
      createdAt: Timestamp.now(),
    };
  } catch (error) {
    console.error('submitIncidentReport failed:', error);
    throw error;
  }
}

/**
 * Lists the reports a user has filed, newest first.
 * @phase Phase 7 — Advanced Safety
 */
export async function getMyIncidentReports(userId: string): Promise<IncidentReport[]> {
  try {
    const snapshot = await getDocs(
      query(
        incidentsCollection(),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        firestoreLimit(INCIDENT_HISTORY_LIMIT),
      ),
    );
    return snapshot.docs.map((document): IncidentReport => {
      const data = document.data();
      const photoUrls: string[] = Array.isArray(data.photoUrls)
        ? (data.photoUrls as string[])
        : Array.isArray(data.photos)
          ? (data.photos as string[])
          : [];
      return {
        ...(data as Omit<IncidentReport, 'id' | 'photoUrls'>),
        id: document.id,
        photoUrls,
      };
    });
  } catch (error) {
    console.error('getMyIncidentReports failed:', error);
    throw error;
  }
}

/**
 * Uploads a piece of photo evidence and returns its download URL.
 * @phase Phase 7 — Advanced Safety
 */
export async function uploadIncidentPhoto(userId: string, localUri: string): Promise<string> {
  try {
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
    const photoRef = ref(storage, `incidents/${userId}/${filename}`);
    // Storage rules typically gate uploads on an image content type.
    await putFile(photoRef, localUri, { contentType: 'image/jpeg' });
    return await getDownloadURL(photoRef);
  } catch (error) {
    console.error('uploadIncidentPhoto failed:', error);
    throw error;
  }
}

const PERCENT = 100;

/**
 * Uploads a silent-evidence audio recording and returns its download URL.
 * `onProgress` (0–100) lets the caller drive an upload progress bar; it's
 * optional so tests and other callers don't need to stub it out.
 * @phase Phase 7 — Advanced Safety
 */
export async function uploadEvidenceRecording(
  userId: string,
  localUri: string,
  onProgress?: (percent: number) => void,
): Promise<string> {
  try {
    const filename = `${Date.now()}.m4a`;
    const evidenceRef = ref(storage, `evidence/${userId}/${filename}`);
    const task = putFile(evidenceRef, localUri);

    if (onProgress !== undefined) {
      task.on('state_changed', (snapshot) => {
        onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * PERCENT));
      });
    }

    await task;
    return await getDownloadURL(evidenceRef);
  } catch (error) {
    console.error('uploadEvidenceRecording failed:', error);
    throw error;
  }
}
