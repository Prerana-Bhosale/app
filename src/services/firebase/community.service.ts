import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  type Timestamp,
} from '@react-native-firebase/firestore';
import { deleteObject, getDownloadURL, putFile, ref } from '@react-native-firebase/storage';

import { firestore, storage } from '@/config/firebase';
import { APP_CONFIG } from '@/constants/config';
import type { CommunityPost, CreatePostInput } from '@/types/community.types';

const COMMUNITY_COLLECTION = 'community';
/** Storage rules typically gate uploads on an image content type. */
const IMAGE_CONTENT_TYPE = 'image/jpeg';

function communityCollection(): ReturnType<typeof collection> {
  return collection(firestore, COMMUNITY_COLLECTION);
}

function communityDoc(postId: string): ReturnType<typeof doc> {
  return doc(firestore, COMMUNITY_COLLECTION, postId);
}

interface PostSnapshot {
  id: string;
  data: (options?: { serverTimestamps?: 'estimate' | 'previous' | 'none' }) => unknown;
}

/**
 * `serverTimestamps: 'estimate'`: right after `createPost` the listener
 * delivers the new post from the local cache before the server has filled in
 * `createdAt`, which otherwise reads as `null` — and `null.toDate()` crashed
 * the feed into the error boundary's "Try again" screen even though the post
 * had been saved (BUG-027).
 */
function mapPost(snapshot: PostSnapshot): CommunityPost {
  return {
    id: snapshot.id,
    ...(snapshot.data({ serverTimestamps: 'estimate' }) as Omit<CommunityPost, 'id'>),
  };
}

type PostQuerySnapshot = { docs: PostSnapshot[] } | null;

/**
 * `onSnapshot` next handler. RNFirebase hands a `null` snapshot when the listener
 * errors (e.g. a missing composite index), so guard before reading `.docs`.
 */
function handleSnapshot(
  snapshot: PostQuerySnapshot,
  onUpdate: (posts: CommunityPost[]) => void,
): void {
  if (snapshot === null) return;
  onUpdate(snapshot.docs.map(mapPost));
}

function handleListenerError(error: Error, onError?: (error: Error) => void): void {
  if (onError) onError(error);
  else console.warn('community listener error:', error);
}

/**
 * Live feed of visible posts in a city, newest first. Returns the unsubscribe.
 * @phase Phase 5 — Community
 */
export function subscribeToCityPosts(
  city: string,
  onUpdate: (posts: CommunityPost[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    query(
      communityCollection(),
      where('city', '==', city),
      where('isHidden', '==', false),
      orderBy('createdAt', 'desc'),
      limit(APP_CONFIG.COMMUNITY_PAGE_SIZE),
    ),
    (snapshot: PostQuerySnapshot): void => handleSnapshot(snapshot, onUpdate),
    (error: Error): void => handleListenerError(error, onError),
  );
}

/**
 * Live feed of visible posts across every city, newest first.
 * @phase Phase 5 — Community
 */
export function subscribeToAllIndiaPosts(
  onUpdate: (posts: CommunityPost[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    query(
      communityCollection(),
      where('isHidden', '==', false),
      orderBy('createdAt', 'desc'),
      limit(APP_CONFIG.COMMUNITY_PAGE_SIZE),
    ),
    (snapshot: PostQuerySnapshot): void => handleSnapshot(snapshot, onUpdate),
    (error: Error): void => handleListenerError(error, onError),
  );
}

/**
 * One older page of city posts after the given cursor timestamp.
 * @phase Phase 5 — Community
 */
export async function loadMoreCityPosts(city: string, after: Timestamp): Promise<CommunityPost[]> {
  try {
    const snapshot = await getDocs(
      query(
        communityCollection(),
        where('city', '==', city),
        where('isHidden', '==', false),
        orderBy('createdAt', 'desc'),
        startAfter(after),
        limit(APP_CONFIG.COMMUNITY_PAGE_SIZE),
      ),
    );
    return snapshot.docs.map(mapPost);
  } catch (error) {
    console.error('loadMoreCityPosts failed:', error);
    throw error;
  }
}

/**
 * One older page of All-India posts after the given cursor timestamp.
 * @phase Phase 5 — Community
 */
export async function loadMoreAllIndiaPosts(after: Timestamp): Promise<CommunityPost[]> {
  try {
    const snapshot = await getDocs(
      query(
        communityCollection(),
        where('isHidden', '==', false),
        orderBy('createdAt', 'desc'),
        startAfter(after),
        limit(APP_CONFIG.COMMUNITY_PAGE_SIZE),
      ),
    );
    return snapshot.docs.map(mapPost);
  } catch (error) {
    console.error('loadMoreAllIndiaPosts failed:', error);
    throw error;
  }
}

/**
 * Publishes a new community post and returns its Firestore id. An anonymous
 * post never persists the author's name or photo.
 * @phase Phase 5 — Community
 */
export async function createPost(
  authorId: string,
  authorName: string,
  authorPhotoUrl: string,
  input: CreatePostInput,
): Promise<string> {
  try {
    const created = await addDoc(communityCollection(), {
      authorId,
      authorName: input.isAnonymous ? '' : authorName,
      authorPhotoUrl: input.isAnonymous ? '' : authorPhotoUrl,
      content: input.content,
      type: input.type,
      isAnonymous: input.isAnonymous,
      locationUrl: input.locationUrl ?? null,
      imageUrl: input.imageUrl ?? null,
      city: input.city,
      state: input.state,
      reportCount: 0,
      isHidden: false,
      createdAt: serverTimestamp(),
    });
    return created.id;
  } catch (error) {
    console.error('createPost failed:', error);
    throw error;
  }
}

/**
 * Records a report for a post under subcollection `community/{postId}/reports/{reporterId}`.
 * Deduplicates reports from the same user so a user cannot report multiple times.
 * Increments `reportCount` on the post; content review and thresholding is handled
 * by Cloud Functions and the moderation dashboard rather than directly muting
 * `isHidden` on the client (BUG-041).
 * @phase Phase 5 — Community
 */
export async function reportPost(
  postId: string,
  reporterId: string,
  reason = 'inappropriate_content',
): Promise<void> {
  if (!reporterId) {
    throw new Error('Reporter ID is required to report a post');
  }
  try {
    const reportRef = doc(firestore, COMMUNITY_COLLECTION, postId, 'reports', reporterId);
    const existing = await getDoc(reportRef);
    if (existing.exists()) {
      return;
    }
    await setDoc(reportRef, {
      reporterId,
      postId,
      reason,
      createdAt: serverTimestamp(),
    });
    await updateDoc(communityDoc(postId), {
      reportCount: increment(1),
    });
  } catch (error) {
    console.error('reportPost failed:', error);
    throw error;
  }
}

/**
 * Deletes the author's own post, and its image if it has one. Firestore
 * rules must allow a delete when `resource.data.authorId == request.auth.uid`.
 * A failure to remove the image never blocks the post deletion itself.
 */
export async function deletePost(post: Pick<CommunityPost, 'id' | 'imageUrl'>): Promise<void> {
  try {
    await deleteDoc(communityDoc(post.id));
  } catch (error) {
    console.error('deletePost failed:', error);
    throw error;
  }
  if (post.imageUrl !== null) {
    await deleteObject(ref(storage, post.imageUrl)).catch((error: unknown) => {
      console.warn('deletePost: image not removed:', error);
    });
  }
}

/**
 * Uploads a community image and returns its download URL.
 * @phase Phase 5 — Community
 */
export async function uploadPostImage(userId: string, localUri: string): Promise<string> {
  try {
    const imageRef = ref(storage, `community/${userId}/${Date.now()}.jpg`);
    await putFile(imageRef, localUri, { contentType: IMAGE_CONTENT_TYPE });
    return await getDownloadURL(imageRef);
  } catch (error) {
    console.error('uploadPostImage failed:', error);
    throw error;
  }
}
