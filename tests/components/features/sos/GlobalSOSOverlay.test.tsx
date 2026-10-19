import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { GlobalSOSOverlay } from '@/components/features/sos/GlobalSOSOverlay';
import { useSOSStore } from '@/stores/sos.store';

describe('GlobalSOSOverlay', () => {
  beforeEach(() => {
    useSOSStore.getState().reset();
  });

  it('renders nothing when SOS is not active', async () => {
    const { toJSON } = await render(<GlobalSOSOverlay />);
    expect(toJSON()).toBeNull();
  });

  it('renders the countdown overlay when SOS is active', async () => {
    useSOSStore.getState().setActive(true, 'button');
    const { getByText } = await render(<GlobalSOSOverlay />);

    expect(getByText('Sending SOS in 5s...')).toBeTruthy();
    expect(getByText('Cancel')).toBeTruthy();
  });

  it('cancels SOS and resets state when Cancel is pressed', async () => {
    useSOSStore.getState().setActive(true, 'button');
    const { getByText } = await render(<GlobalSOSOverlay />);

    await fireEvent.press(getByText('Cancel'));
    expect(useSOSStore.getState().isActive).toBe(false);
  });
});
