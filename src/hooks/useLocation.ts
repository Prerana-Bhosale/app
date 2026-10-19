import { useCallback, useEffect, useRef } from 'react';

import { watchLocation } from '@/services/location.service';
import { useLocationStore } from '@/stores/location.store';
import type { LocationData } from '@/types/location.types';
import { getLocationUrl } from '@/utils/location.utils';
import { requestLocationPermission } from '@/utils/permissions.utils';

export interface UseLocationResult {
  currentLocation: LocationData | null;
  locationPermissionGranted: boolean;
  requestPermission: () => Promise<boolean>;
  getLocationUrl: () => string | null;
}

/**
 * Foreground location access for screens. `requestPermission` prompts, records
 * the outcome in the store and — on grant — starts a position watch that keeps
 * `currentLocation` fresh until the component using this hook unmounts.
 */
export function useLocation(): UseLocationResult {
  const currentLocation = useLocationStore((state) => state.currentLocation);
  const locationPermissionGranted = useLocationStore((state) => state.locationPermissionGranted);
  const setCurrentLocation = useLocationStore((state) => state.setCurrentLocation);
  const setLocationPermission = useLocationStore((state) => state.setLocationPermission);

  const unsubscribeRef = useRef<(() => void) | null>(null);

  const startWatch = useCallback((): void => {
    if (unsubscribeRef.current !== null) return;
    unsubscribeRef.current = watchLocation((location) => setCurrentLocation(location));
  }, [setCurrentLocation]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const granted = await requestLocationPermission();
      setLocationPermission(granted);
      if (granted) startWatch();
      return granted;
    } catch (error) {
      console.warn('useLocation: requestPermission failed:', error);
      setLocationPermission(false);
      return false;
    }
  }, [setLocationPermission, startWatch]);

  useEffect(() => {
    return (): void => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, []);

  const buildLocationUrl = useCallback((): string | null => {
    if (currentLocation === null) return null;
    return getLocationUrl(currentLocation.latitude, currentLocation.longitude);
  }, [currentLocation]);

  return {
    currentLocation,
    locationPermissionGranted,
    requestPermission,
    getLocationUrl: buildLocationUrl,
  };
}
