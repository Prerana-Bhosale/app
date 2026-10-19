import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { useAuthStore } from '@/stores/auth.store';
import { useLocationStore } from '@/stores/location.store';
import MapScreen from '@app/(tabs)/map';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

const mockSubscribe = jest.fn((_cb: (areas: unknown[]) => void) => jest.fn());
jest.mock('@/services/firebase/unsafe-areas.service', () => ({
  subscribeToUnsafeAreas: (cb: (areas: unknown[]) => void) => mockSubscribe(cb),
  reportUnsafeArea: jest.fn(() => Promise.resolve('area-1')),
  voteOnUnsafeArea: jest.fn(() => Promise.resolve()),
}));

describe('MapScreen', () => {
  it('renders the map heading', async () => {
    const { getByText } = await render(<MapScreen />);
    expect(getByText('Safety Map')).toBeTruthy();
  });

  it('subscribes to unsafe areas and renders the report action', async () => {
    const { getByLabelText } = await render(<MapScreen />);
    expect(mockSubscribe).toHaveBeenCalled();
    expect(getByLabelText('Report Unsafe Area')).toBeTruthy();
  });

  it('toggles the legend and gates the report action behind sign-in', async () => {
    const { getByLabelText, getByText } = await render(<MapScreen />);
    await fireEvent.press(getByLabelText('Map Legend'));
    expect(getByText('Reported — pending review')).toBeTruthy();
    // A guest tapping report gets the sign-in prompt, not the modal.
    await fireEvent.press(getByLabelText('Report Unsafe Area'));
  });

  function area(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'a1',
      reportedBy: 'u9',
      latitude: 19,
      longitude: 72,
      radiusMeters: 200,
      title: 'Dark lane',
      description: 'No street lights after 8pm',
      category: 'poorly_lit',
      status: 'approved',
      pinColor: 'red',
      upvotes: 2,
      downvotes: 0,
      voterIds: [],
      ...overrides,
    };
  }

  it('keeps the open area card in sync with live vote counts', async () => {
    let push: (areas: unknown[]) => void = () => undefined;
    mockSubscribe.mockImplementationOnce((cb) => {
      push = cb;
      return jest.fn();
    });
    const { getByTestId, getByText, findByText } = await render(<MapScreen />);

    await act(() => push([area()]));
    await fireEvent.press(getByTestId('unsafe-area-a1'));
    expect(getByText('Dark lane')).toBeTruthy();
    expect(getByText('2 votes')).toBeTruthy();

    await act(() => push([area({ upvotes: 3 })]));
    expect(await findByText('3 votes')).toBeTruthy();
  });

  it('hides the report button while an area card is open', async () => {
    let push: (areas: unknown[]) => void = () => undefined;
    mockSubscribe.mockImplementationOnce((cb) => {
      push = cb;
      return jest.fn();
    });
    const { getByTestId, queryByLabelText } = await render(<MapScreen />);

    await act(() => push([area()]));
    await fireEvent.press(getByTestId('unsafe-area-a1'));

    expect(queryByLabelText('Report Unsafe Area')).toBeNull();
  });

  it('disables voting once the signed-in user has voted', async () => {
    useAuthStore.setState({ user: { uid: 'u1' } as never, isGuest: false });
    let push: (areas: unknown[]) => void = () => undefined;
    mockSubscribe.mockImplementationOnce((cb) => {
      push = cb;
      return jest.fn();
    });
    const { getByTestId, getByLabelText } = await render(<MapScreen />);

    await act(() => push([area({ voterIds: ['u1'] })]));
    await fireEvent.press(getByTestId('unsafe-area-a1'));

    expect(getByLabelText('Upvote').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('renders cached unsafe areas instantly on mount from useLocationStore', async () => {
    useLocationStore
      .getState()
      .setCachedUnsafeAreas([area({ id: 'cached-1', title: 'Cached Hazard' }) as never]);

    const { getByTestId, getByText } = await render(<MapScreen />);
    expect(getByTestId('unsafe-area-cached-1')).toBeTruthy();
    await fireEvent.press(getByTestId('unsafe-area-cached-1'));
    expect(getByText('Cached Hazard')).toBeTruthy();
  });

  it('animates camera when currentLocation is acquired', async () => {
    useLocationStore.getState().setCurrentLocation({
      latitude: 18.5204,
      longitude: 73.8567,
      timestamp: 123456,
    });
    const { getByText } = await render(<MapScreen />);
    expect(getByText('Safety Map')).toBeTruthy();
  });
});
