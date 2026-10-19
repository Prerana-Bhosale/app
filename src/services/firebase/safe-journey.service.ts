import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from '@react-native-firebase/firestore';

import { firestore } from '@/config/firebase';
import type { SafeJourneySession } from '@/types/location.types';

const SESSIONS_COLLECTION = 'safeJourneySessions';
const MS_PER_MINUTE = 60 * 1000;

function sessionsCollection(): ReturnType<typeof collection> {
  return collection(firestore, SESSIONS_COLLECTION);
}

function sessionDoc(sessionId: string): ReturnType<typeof doc> {
  return doc(firestore, SESSIONS_COLLECTION, sessionId);
}

/**
 * Starts a monitored journey and returns its Firestore id. Contacts are alerted
 * by the screen if the countdown to `expectedArrivalAt` elapses.
 * @phase Phase 4 — Location & Maps
 */
export async function createSafeJourneySession(
  userId: string,
  destinationName: string,
  destinationLat: number,
  destinationLng: number,
  etaMinutes: number,
  sharedWithUserIds: string[],
): Promise<string> {
  try {
    const expectedArrival = new Date(Date.now() + etaMinutes * MS_PER_MINUTE);
    const created = await addDoc(sessionsCollection(), {
      userId,
      destinationName,
      destinationLatitude: destinationLat,
      destinationLongitude: destinationLng,
      etaMinutes,
      sharedWithUserIds,
      startedAt: serverTimestamp(),
      expectedArrivalAt: Timestamp.fromDate(expectedArrival),
      status: 'active',
    });
    return created.id;
  } catch (error) {
    console.error('createSafeJourneySession failed:', error);
    throw error;
  }
}

/**
 * "I'm safe" check-in — restarts the countdown from now by the journey's ETA
 * interval, but never pulls the deadline earlier: after a "+30 min" extension
 * a check-in used to *shorten* the time left (BUG-030).
 * @phase Phase 4 — Location & Maps
 */
export async function checkInSafeJourney(sessionId: string): Promise<void> {
  try {
    const snapshot = await getDoc(sessionDoc(sessionId));
    const data = snapshot.data() as Omit<SafeJourneySession, 'id'> | undefined;
    if (data === undefined) throw new Error('Session not found');

    const nextArrival = new Date(
      Math.max(
        data.expectedArrivalAt.toDate().getTime(),
        Date.now() + data.etaMinutes * MS_PER_MINUTE,
      ),
    );
    await updateDoc(sessionDoc(sessionId), {
      status: 'active',
      expectedArrivalAt: Timestamp.fromDate(nextArrival),
    });
  } catch (error) {
    console.error('checkInSafeJourney failed:', error);
    throw error;
  }
}

/**
 * Adds `additionalMinutes` to the expected arrival time.
 * @phase Phase 4 — Location & Maps
 */
export async function extendSafeJourneyEta(
  sessionId: string,
  additionalMinutes: number,
): Promise<void> {
  try {
    const snapshot = await getDoc(sessionDoc(sessionId));
    const data = snapshot.data() as Omit<SafeJourneySession, 'id'> | undefined;
    if (data === undefined) throw new Error('Session not found');

    const currentMs = data.expectedArrivalAt.toDate().getTime();
    const baseMs = Math.max(Date.now(), currentMs);
    const nextArrival = new Date(baseMs + additionalMinutes * MS_PER_MINUTE);
    await updateDoc(sessionDoc(sessionId), {
      status: 'active',
      expectedArrivalAt: Timestamp.fromDate(nextArrival),
    });
  } catch (error) {
    console.error('extendSafeJourneyEta failed:', error);
    throw error;
  }
}

/**
 * Marks a journey as safely arrived.
 * @phase Phase 4 — Location & Maps
 */
export async function markSafeJourneyArrived(sessionId: string): Promise<void> {
  try {
    await updateDoc(sessionDoc(sessionId), { status: 'arrived' });
  } catch (error) {
    console.error('markSafeJourneyArrived failed:', error);
    throw error;
  }
}

/**
 * Cancels a journey without alerting contacts.
 * @phase Phase 4 — Location & Maps
 */
export async function cancelSafeJourney(sessionId: string): Promise<void> {
  try {
    await updateDoc(sessionDoc(sessionId), { status: 'cancelled' });
  } catch (error) {
    console.error('cancelSafeJourney failed:', error);
    throw error;
  }
}

/**
 * Records that the missed-arrival alert has been fired for this journey.
 * @phase Phase 4 — Location & Maps
 */
export async function markAlertSent(sessionId: string): Promise<void> {
  try {
    await updateDoc(sessionDoc(sessionId), { status: 'alert_sent' });
  } catch (error) {
    console.error('markAlertSent failed:', error);
    throw error;
  }
}

/**
 * Returns the user's currently active journey, or `null` if there is none.
 * @phase Phase 4 — Location & Maps
 */
export async function getActiveJourneySession(userId: string): Promise<SafeJourneySession | null> {
  try {
    const snapshot = await getDocs(
      query(
        sessionsCollection(),
        where('userId', '==', userId),
        where('status', '==', 'active'),
        limit(1),
      ),
    );
    const first = snapshot.docs[0];
    if (first === undefined) return null;
    return { id: first.id, ...(first.data() as Omit<SafeJourneySession, 'id'>) };
  } catch (error) {
    console.error('getActiveJourneySession failed:', error);
    throw error;
  }
}
