import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from '@react-native-firebase/firestore';

import { firestore } from '@/config/firebase';
import { APP_CONFIG } from '@/constants/config';
import type { UnsafeArea, UnsafeAreaCategory } from '@/types/location.types';

const AREAS_COLLECTION = 'unsafeAreas';

function areasCollection(): ReturnType<typeof collection> {
  return collection(firestore, AREAS_COLLECTION);
}

function areaDoc(areaId: string): ReturnType<typeof doc> {
  return doc(firestore, AREAS_COLLECTION, areaId);
}

/**
 * Submits a new unsafe-area report for moderation and returns its Firestore id.
 * New reports always start `pending` with an orange pin.
 * @phase Phase 4 — Location & Maps
 */
export async function reportUnsafeArea(
  reportedBy: string,
  latitude: number,
  longitude: number,
  title: string,
  description: string,
  category: UnsafeAreaCategory,
): Promise<string> {
  try {
    const created = await addDoc(areasCollection(), {
      reportedBy,
      latitude,
      longitude,
      radiusMeters: APP_CONFIG.UNSAFE_AREA_DEFAULT_RADIUS_METERS,
      title,
      description,
      category,
      status: 'pending',
      pinColor: 'orange',
      upvotes: 0,
      downvotes: 0,
      voterIds: [],
      createdAt: serverTimestamp(),
    });
    return created.id;
  } catch (error) {
    console.error('reportUnsafeArea failed:', error);
    throw error;
  }
}

/**
 * Subscribes to unsafe areas, newest first, bounded by query limit.
 * Returns the unsubscribe function.
 *
 * Guests are never signed in to Firebase Auth (`isGuest` is a local-only
 * flag), so this listener runs unauthenticated for them. If Firestore rules
 * reject that read, `onSnapshot` reports it through the error callback rather
 * than throwing.
 *
 * To prevent momentary offline network drops or connection handovers from
 * wiping all visible safety hazard pins from the user's map (BUG-065, NEW-005),
 * existing loaded markers are preserved instead of cleared with an empty array.
 * @phase Phase 4 — Location & Maps
 */
export function subscribeToUnsafeAreas(
  onUpdate: (areas: UnsafeArea[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  return onSnapshot(
    query(
      areasCollection(),
      orderBy('createdAt', 'desc'),
      limit(APP_CONFIG.UNSAFE_AREA_QUERY_LIMIT),
    ),
    (snapshot) => {
      onUpdate(
        snapshot.docs.map((document) => ({
          id: document.id,
          ...(document.data() as Omit<UnsafeArea, 'id'>),
        })),
      );
    },
    (error) => {
      console.error('subscribeToUnsafeAreas failed:', error);
      onError?.(error);
    },
  );
}

/**
 * Records an up or down vote. One vote per user per area — a repeat vote from
 * the same user is a no-op.
 * @phase Phase 4 — Location & Maps
 */
export async function voteOnUnsafeArea(
  areaId: string,
  userId: string,
  vote: 'up' | 'down',
): Promise<void> {
  try {
    const snapshot = await getDoc(areaDoc(areaId));
    const data = snapshot.data() as Omit<UnsafeArea, 'id'> | undefined;
    if (data === undefined) throw new Error('Area not found');
    if (data.voterIds.includes(userId)) return;

    await updateDoc(areaDoc(areaId), {
      [vote === 'up' ? 'upvotes' : 'downvotes']: increment(1),
      voterIds: arrayUnion(userId),
    });
  } catch (error) {
    console.error('voteOnUnsafeArea failed:', error);
    throw error;
  }
}
