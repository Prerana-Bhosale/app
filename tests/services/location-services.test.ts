import * as Location from 'expo-location';

import {
  autocompletePlaces,
  buildLocationUrl,
  fetchNearbyPlaces,
  getCurrentLocation,
  getFreshLocation,
  getLocationWithTimeout,
  getPlaceLocation,
  reverseGeocode,
  watchLocation,
} from '@/services/location.service';

describe('getCurrentLocation', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest
      .mocked(Location.requestForegroundPermissionsAsync)
      .mockResolvedValue({ granted: true } as never);
  });

  afterEach(() => errorSpy.mockRestore());

  it('returns a LocationData shape when permission is granted', async () => {
    const result = await getCurrentLocation();
    expect(result).toEqual({
      latitude: 19.076,
      longitude: 72.8777,
      timestamp: 1_700_000_000_000,
      accuracy: 5,
    });
  });

  it('omits accuracy when the platform does not report it', async () => {
    jest.mocked(Location.getCurrentPositionAsync).mockResolvedValueOnce({
      coords: { latitude: 1, longitude: 2, accuracy: null },
      timestamp: 5,
    } as never);

    const result = await getCurrentLocation();
    expect(result).not.toHaveProperty('accuracy');
  });

  it('rejects with the i18n key when permission is denied', async () => {
    jest
      .mocked(Location.requestForegroundPermissionsAsync)
      .mockResolvedValueOnce({ granted: false } as never);

    await expect(getCurrentLocation()).rejects.toThrow('errors.locationPermissionDenied');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('falls back to last known position when fresh fix times out', async () => {
    jest
      .mocked(Location.getCurrentPositionAsync)
      .mockImplementationOnce(() => new Promise(() => undefined));
    jest.mocked(Location.getLastKnownPositionAsync).mockResolvedValueOnce({
      coords: { latitude: 19.1, longitude: 72.8, accuracy: 10 },
      timestamp: 12345,
    } as never);

    const result = await getCurrentLocation(20);
    expect(result).toEqual({
      latitude: 19.1,
      longitude: 72.8,
      timestamp: 12345,
      accuracy: 10,
    });
  });

  it('throws errors.locationUnavailable when fresh fix times out and last known position is null', async () => {
    jest
      .mocked(Location.getCurrentPositionAsync)
      .mockImplementationOnce(() => new Promise(() => undefined));
    jest.mocked(Location.getLastKnownPositionAsync).mockResolvedValueOnce(null);

    await expect(getCurrentLocation(20)).rejects.toThrow('errors.locationUnavailable');
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('getLocationWithTimeout', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest
      .mocked(Location.getForegroundPermissionsAsync)
      .mockResolvedValue({ granted: true } as never);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    jest.useRealTimers();
  });

  it('returns a fresh fix when it arrives in time', async () => {
    await expect(getLocationWithTimeout(1000)).resolves.toMatchObject({ latitude: 19.076 });
    expect(Location.getLastKnownPositionAsync).not.toHaveBeenCalled();
  });

  it('falls back to the last known position when the fresh fix times out', async () => {
    jest.useFakeTimers();
    jest
      .mocked(Location.getCurrentPositionAsync)
      .mockReturnValueOnce(new Promise(() => undefined) as never);
    jest.mocked(Location.getLastKnownPositionAsync).mockResolvedValueOnce({
      coords: { latitude: 10, longitude: 20, accuracy: null },
      timestamp: 7,
    } as never);

    const pending = getLocationWithTimeout(1000);
    await jest.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toEqual({ latitude: 10, longitude: 20, timestamp: 7 });
  });

  it('falls back to the last known position when the fresh fix fails', async () => {
    jest.mocked(Location.getCurrentPositionAsync).mockRejectedValueOnce(new Error('no gps'));
    jest.mocked(Location.getLastKnownPositionAsync).mockResolvedValueOnce({
      coords: { latitude: 10, longitude: 20, accuracy: 3 },
      timestamp: 7,
    } as never);

    await expect(getLocationWithTimeout(1000)).resolves.toMatchObject({ latitude: 10 });
  });

  it('rejects when neither a fresh nor a last known position exists', async () => {
    jest.mocked(Location.getCurrentPositionAsync).mockRejectedValueOnce(new Error('no gps'));

    await expect(getLocationWithTimeout(1000)).rejects.toThrow('errors.locationUnavailable');
  });

  it('never prompts: rejects straight away without a foreground grant', async () => {
    jest
      .mocked(Location.getForegroundPermissionsAsync)
      .mockResolvedValueOnce({ granted: false } as never);

    await expect(getLocationWithTimeout(1000)).rejects.toThrow('errors.locationPermissionDenied');
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('getFreshLocation', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest
      .mocked(Location.requestForegroundPermissionsAsync)
      .mockResolvedValue({ granted: true } as never);
    jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(true);
  });

  afterEach(() => errorSpy.mockRestore());

  it('returns a fix taken just now', async () => {
    jest.mocked(Location.getCurrentPositionAsync).mockResolvedValueOnce({
      coords: { latitude: 1, longitude: 2, accuracy: 5 },
      timestamp: Date.now(),
    } as never);

    await expect(getFreshLocation()).resolves.toMatchObject({ latitude: 1, longitude: 2 });
  });

  it('rejects when location services are switched off', async () => {
    jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValueOnce(false);

    await expect(getFreshLocation()).rejects.toThrow('errors.locationServicesOff');
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('rejects a fix older than the allowed age', async () => {
    jest.mocked(Location.getCurrentPositionAsync).mockResolvedValueOnce({
      coords: { latitude: 1, longitude: 2, accuracy: 5 },
      timestamp: Date.now() - 5 * 60_000,
    } as never);

    await expect(getFreshLocation(60_000)).rejects.toThrow('errors.locationStale');
  });
});

describe('buildLocationUrl', () => {
  it('formats the canonical maps place link', () => {
    expect(buildLocationUrl(19.076, 72.8777)).toBe(
      'https://www.google.com/maps/place/19.076,72.8777',
    );
  });
});

describe('watchLocation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns an unsubscribe function and never throws synchronously', () => {
    const unsubscribe = watchLocation(jest.fn());
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });

  it('forwards each fix to the callback', async () => {
    const onChange = jest.fn();
    jest.mocked(Location.watchPositionAsync).mockImplementationOnce((_options, listener) => {
      (listener as (p: unknown) => void)({
        coords: { latitude: 1, longitude: 2, accuracy: 3 },
        timestamp: 9,
      });
      return Promise.resolve({ remove: jest.fn() });
    });

    watchLocation(onChange);
    await Promise.resolve();

    expect(onChange).toHaveBeenCalledWith({
      latitude: 1,
      longitude: 2,
      timestamp: 9,
      accuracy: 3,
    });
  });
});

describe('reverseGeocode', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps the first result to city and state', async () => {
    const result = await reverseGeocode(19.076, 72.8777);
    expect(result).toEqual({ city: 'Mumbai', state: 'Maharashtra' });
  });
});

describe('Places API (New)', () => {
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

  afterAll(() => errorSpy.mockRestore());
  beforeEach(() => jest.clearAllMocks());

  function mockResponse(ok: boolean, body: unknown): void {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok, json: () => Promise.resolve(body) }),
    ) as unknown as typeof fetch;
  }

  describe('fetchNearbyPlaces', () => {
    it('normalises and sorts places by ascending distance', async () => {
      mockResponse(true, {
        places: [
          {
            id: 'far',
            displayName: { text: 'Far station' },
            formattedAddress: 'Far road',
            location: { latitude: 19.2, longitude: 72.9 },
          },
          {
            id: 'near',
            displayName: { text: 'Near station' },
            formattedAddress: 'Near road',
            location: { latitude: 19.08, longitude: 72.88 },
            currentOpeningHours: { openNow: true },
            nationalPhoneNumber: '022 1234 5678',
          },
        ],
      });

      const result = await fetchNearbyPlaces(19.076, 72.8777, 'police');

      expect(result.map((place) => place.id)).toEqual(['near', 'far']);
      expect(result[0]?.isOpen).toBe(true);
      expect(result[0]?.phoneNumber).toBe('022 1234 5678');
      expect(result[1]?.isOpen).toBeNull();
      expect(result[1]).not.toHaveProperty('phoneNumber');
      expect(result[0]?.distanceKm).toBeLessThan(result[1]?.distanceKm ?? Infinity);
    });

    it('throws with the API message when the request is rejected', async () => {
      mockResponse(false, {
        error: { code: 403, message: 'API not enabled', status: 'PERMISSION_DENIED' },
      });
      await expect(fetchNearbyPlaces(19.076, 72.8777, 'hospital')).rejects.toThrow(
        'API not enabled',
      );
    });

    it('returns an empty list when there are no places', async () => {
      mockResponse(true, {});
      await expect(fetchNearbyPlaces(19.076, 72.8777, 'fire_station')).resolves.toEqual([]);
    });
  });

  describe('autocompletePlaces', () => {
    it('flattens suggestions to id + primary/secondary text', async () => {
      mockResponse(true, {
        suggestions: [
          {
            placePrediction: {
              placeId: 'p1',
              text: { text: 'Andheri Station, Mumbai' },
              structuredFormat: {
                mainText: { text: 'Andheri Station' },
                secondaryText: { text: 'Mumbai, Maharashtra' },
              },
            },
          },
          { queryPrediction: { text: { text: 'ignored' } } },
        ],
      });

      const result = await autocompletePlaces('andheri', { latitude: 19, longitude: 72 });
      expect(result).toEqual([
        { placeId: 'p1', primaryText: 'Andheri Station', secondaryText: 'Mumbai, Maharashtra' },
      ]);
    });

    it('throws when the API errors', async () => {
      mockResponse(false, {
        error: { code: 400, message: 'bad input', status: 'INVALID_ARGUMENT' },
      });
      await expect(autocompletePlaces('x')).rejects.toThrow('bad input');
    });
  });

  describe('getPlaceLocation', () => {
    it('resolves a placeId to a name and coordinates', async () => {
      mockResponse(true, {
        id: 'p1',
        displayName: { text: 'Andheri Station' },
        location: { latitude: 19.119, longitude: 72.846 },
      });

      await expect(getPlaceLocation('p1')).resolves.toEqual({
        name: 'Andheri Station',
        latitude: 19.119,
        longitude: 72.846,
      });
    });

    it('throws when the place has no location', async () => {
      mockResponse(true, { id: 'p1', displayName: { text: 'x' } });
      await expect(getPlaceLocation('p1')).rejects.toThrow('errors.networkError');
    });
  });
});
