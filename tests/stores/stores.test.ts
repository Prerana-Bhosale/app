import { APP_CONFIG } from '@/constants/config';
import { useAuthStore } from '@/stores/auth.store';
import { useLocationStore } from '@/stores/location.store';
import { useSOSStore } from '@/stores/sos.store';
import { useUserStore } from '@/stores/user.store';

describe('auth.store', () => {
  beforeEach(() => useAuthStore.getState().reset());

  it('starts empty and uninitialised', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.surakshakUser).toBeNull();
    expect(state.isGuest).toBe(false);
    expect(state.isInitialized).toBe(false);
  });

  it('records the loading and initialised flags', () => {
    useAuthStore.getState().setLoading(true);
    useAuthStore.getState().setInitialized(true);

    expect(useAuthStore.getState().isLoading).toBe(true);
    expect(useAuthStore.getState().isInitialized).toBe(true);
  });

  it('stores the Surakshak profile alongside the credential', () => {
    const profile = { userId: 'u1', name: 'Priya' } as never;
    useAuthStore.getState().setSurakshakUser(profile);
    expect(useAuthStore.getState().surakshakUser).toBe(profile);
  });

  it('reset returns every field to its initial value', () => {
    useAuthStore.getState().setGuest(true);
    useAuthStore.getState().setLoading(true);
    useAuthStore.getState().reset();

    expect(useAuthStore.getState().isGuest).toBe(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});

describe('user.store', () => {
  beforeEach(() => useUserStore.getState().reset());

  it('starts with no profile and no contacts', () => {
    expect(useUserStore.getState().profile).toBeNull();
    expect(useUserStore.getState().emergencyContacts).toEqual([]);
  });

  it('stores emergency contacts and the loading flag', () => {
    const contacts = [
      {
        id: 'c1',
        name: 'Ma',
        phone: '+919876543210',
        relationship: 'Mother',
        isPredefined: false,
        order: 7,
      },
    ];
    useUserStore.getState().setEmergencyContacts(contacts);
    useUserStore.getState().setLoadingProfile(true);

    expect(useUserStore.getState().emergencyContacts).toHaveLength(1);
    expect(useUserStore.getState().isLoadingProfile).toBe(true);
  });

  it('reset empties the contact list rather than sharing the initial array', () => {
    useUserStore.getState().setEmergencyContacts([
      {
        id: 'c1',
        name: 'Ma',
        phone: '+919876543210',
        relationship: 'Mother',
        isPredefined: false,
        order: 7,
      },
    ]);
    useUserStore.getState().reset();

    expect(useUserStore.getState().emergencyContacts).toEqual([]);
  });
});

describe('location.store', () => {
  beforeEach(() => useLocationStore.getState().reset());

  it('records the current position and permission flag', () => {
    useLocationStore.getState().setCurrentLocation({
      latitude: 19.076,
      longitude: 72.8777,
      timestamp: 1,
    });
    useLocationStore.getState().setLocationPermission(true);

    expect(useLocationStore.getState().currentLocation?.latitude).toBe(19.076);
    expect(useLocationStore.getState().locationPermissionGranted).toBe(true);
  });

  it('keeps the session id only while live location is active', () => {
    useLocationStore.getState().setLiveLocationActive(true, 'session-1');
    expect(useLocationStore.getState().liveLocationSessionId).toBe('session-1');

    useLocationStore.getState().setLiveLocationActive(false);
    expect(useLocationStore.getState().liveLocationSessionId).toBeNull();
  });

  it('keeps the journey id only while a safe journey is active', () => {
    useLocationStore.getState().setSafeJourneyActive(true, 'journey-1');
    expect(useLocationStore.getState().safeJourneySessionId).toBe('journey-1');

    useLocationStore.getState().setSafeJourneyActive(false);
    expect(useLocationStore.getState().safeJourneySessionId).toBeNull();
  });

  it('defaults the session id to null when activated without one', () => {
    useLocationStore.getState().setLiveLocationActive(true);
    expect(useLocationStore.getState().isLiveLocationActive).toBe(true);
    expect(useLocationStore.getState().liveLocationSessionId).toBeNull();
  });

  it('stores and clears cached unsafe areas', () => {
    const area = {
      id: 'a1',
      reportedBy: 'u1',
      latitude: 19.0,
      longitude: 72.8,
      radiusMeters: 200,
      title: 'Dark lane',
      description: 'Poor light',
      category: 'poorly_lit' as const,
      status: 'approved' as const,
      pinColor: 'red' as const,
      upvotes: 0,
      downvotes: 0,
      voterIds: [],
      createdAt: null as never,
    };
    useLocationStore.getState().setCachedUnsafeAreas([area]);
    expect(useLocationStore.getState().cachedUnsafeAreas).toEqual([area]);

    useLocationStore.getState().reset();
    expect(useLocationStore.getState().cachedUnsafeAreas).toEqual([]);
  });

  it('reset clears everything', () => {
    useLocationStore.getState().setLiveLocationActive(true, 'session-1');
    useLocationStore.getState().reset();

    expect(useLocationStore.getState().isLiveLocationActive).toBe(false);
    expect(useLocationStore.getState().currentLocation).toBeNull();
  });
});

describe('sos.store', () => {
  beforeEach(() => useSOSStore.getState().reset());

  it('starts inactive with a full countdown', () => {
    expect(useSOSStore.getState().isActive).toBe(false);
    expect(useSOSStore.getState().countdown).toBe(APP_CONFIG.SOS_COUNTDOWN_SECONDS);
  });

  it('activating records the trigger method and resets the countdown', () => {
    useSOSStore.getState().setCountdown(1);
    useSOSStore.getState().setActive(true, 'volume');

    expect(useSOSStore.getState().triggerMethod).toBe('volume');
    expect(useSOSStore.getState().countdown).toBe(APP_CONFIG.SOS_COUNTDOWN_SECONDS);
  });

  it('deactivating clears the trigger method', () => {
    useSOSStore.getState().setActive(true, 'shake');
    useSOSStore.getState().setActive(false);

    expect(useSOSStore.getState().isActive).toBe(false);
    expect(useSOSStore.getState().triggerMethod).toBeNull();
  });

  it('tracks the siren and recording flags independently', () => {
    useSOSStore.getState().setSirenActive(true);
    useSOSStore.getState().setRecording(true);

    expect(useSOSStore.getState().isSirenActive).toBe(true);
    expect(useSOSStore.getState().isRecording).toBe(true);
  });

  it('counts down', () => {
    useSOSStore.getState().setCountdown(3);
    expect(useSOSStore.getState().countdown).toBe(3);
  });
});
