import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { AppState, type AppStateStatus, Linking } from 'react-native';

import NearbyHelpScreen from '@app/nearby-help';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

const mockGetCurrentLocation = jest.fn();
const mockFetchNearbyPlaces = jest.fn();
jest.mock('@/services/location.service', () => ({
  getCurrentLocation: () => mockGetCurrentLocation(),
  fetchNearbyPlaces: (lat: number, lng: number, type: string) =>
    mockFetchNearbyPlaces(lat, lng, type),
}));

describe('NearbyHelpScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentLocation.mockResolvedValue({ latitude: 19, longitude: 72, timestamp: 0 });
    mockFetchNearbyPlaces.mockResolvedValue([]);
  });

  it('renders the four help-category tabs and loads places', async () => {
    const { getByText } = await render(<NearbyHelpScreen />);
    expect(getByText('Police Stations')).toBeTruthy();
    expect(getByText('Hospitals')).toBeTruthy();
    expect(getByText('Fire Stations')).toBeTruthy();
    expect(getByText('Pharmacies')).toBeTruthy();
    await waitFor(() => expect(mockFetchNearbyPlaces).toHaveBeenCalledTimes(4));
  });

  it('switches the active category on tab press', async () => {
    const { getByText } = await render(<NearbyHelpScreen />);
    await waitFor(() => expect(mockFetchNearbyPlaces).toHaveBeenCalled());
    await fireEvent.press(getByText('Hospitals'));
    expect(getByText('No places found nearby')).toBeTruthy();
  });

  it('shows the location permission error state when location is denied and opens settings', async () => {
    const openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    mockGetCurrentLocation.mockRejectedValueOnce(new Error('errors.locationPermissionDenied'));
    const { getByText } = await render(<NearbyHelpScreen />);
    await waitFor(() => expect(getByText('Location unavailable')).toBeTruthy());
    expect(getByText('Location permission required. Please enable in Settings.')).toBeTruthy();
    await fireEvent.press(getByText('Open Settings'));
    expect(openSettingsSpy).toHaveBeenCalledTimes(1);
    openSettingsSpy.mockRestore();
  });

  it('automatically refreshes when app returns to active from settings', async () => {
    let appStateListener: ((state: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    });

    mockGetCurrentLocation
      .mockRejectedValueOnce(new Error('errors.locationPermissionDenied'))
      .mockResolvedValueOnce({ latitude: 19, longitude: 72, timestamp: 0 });

    const { getByText } = await render(<NearbyHelpScreen />);
    await waitFor(() => expect(getByText('Location unavailable')).toBeTruthy());

    await act(async () => {
      appStateListener?.('active');
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockGetCurrentLocation).toHaveBeenCalledTimes(2);
    });
  });

  it('shows the network error state with a retry when places fetch fails', async () => {
    mockFetchNearbyPlaces.mockRejectedValueOnce(new Error('network error'));
    const { getByText } = await render(<NearbyHelpScreen />);
    await waitFor(() =>
      expect(
        getByText('Could not load nearby places. Check your connection and try again.'),
      ).toBeTruthy(),
    );
    await fireEvent.press(getByText('Try again'));
  });
});
