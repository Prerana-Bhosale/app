import { create } from 'zustand';

import type { LocationData, UnsafeArea } from '@/types/location.types';

interface LocationStore {
  currentLocation: LocationData | null;
  locationPermissionGranted: boolean;
  isLiveLocationActive: boolean;
  liveLocationSessionId: string | null;
  isSafeJourneyActive: boolean;
  safeJourneySessionId: string | null;
  /** Bumped whenever a journey's deadline changes, so the app-wide monitor re-reads it. */
  safeJourneyRevision: number;
  cachedUnsafeAreas: UnsafeArea[];
  setCurrentLocation: (location: LocationData) => void;
  setLocationPermission: (granted: boolean) => void;
  setLiveLocationActive: (active: boolean, sessionId?: string) => void;
  setSafeJourneyActive: (active: boolean, sessionId?: string) => void;
  bumpSafeJourneyRevision: () => void;
  setCachedUnsafeAreas: (areas: UnsafeArea[]) => void;
  reset: () => void;
}

const initialState = {
  currentLocation: null,
  locationPermissionGranted: false,
  isLiveLocationActive: false,
  liveLocationSessionId: null,
  isSafeJourneyActive: false,
  safeJourneySessionId: null,
  safeJourneyRevision: 0,
  cachedUnsafeAreas: [] as UnsafeArea[],
};

export const useLocationStore = create<LocationStore>((set) => ({
  ...initialState,
  setCurrentLocation: (currentLocation): void => set({ currentLocation }),
  setLocationPermission: (locationPermissionGranted): void => set({ locationPermissionGranted }),
  setLiveLocationActive: (active, sessionId): void =>
    set({
      isLiveLocationActive: active,
      liveLocationSessionId: active ? (sessionId ?? null) : null,
    }),
  setSafeJourneyActive: (active, sessionId): void =>
    set({
      isSafeJourneyActive: active,
      safeJourneySessionId: active ? (sessionId ?? null) : null,
    }),
  bumpSafeJourneyRevision: (): void =>
    set((state) => ({ safeJourneyRevision: state.safeJourneyRevision + 1 })),
  setCachedUnsafeAreas: (cachedUnsafeAreas): void => set({ cachedUnsafeAreas }),
  reset: (): void => set({ ...initialState, cachedUnsafeAreas: [] }),
}));
