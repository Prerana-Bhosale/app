import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { Button } from '@/components/ui/Button';

describe('Button', () => {
  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    const { getByText } = await render(
      <Button variant="primary" size="md" label="Send SOS" onPress={onPress} />,
    );

    await fireEvent.press(getByText('Send SOS'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(
      <Button variant="primary" size="md" label="Send SOS" onPress={onPress} disabled />,
    );

    await fireEvent.press(getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('applies high-contrast disabled styling when disabled', async () => {
    const { getByRole, getByText } = await render(
      <Button variant="primary" size="md" label="Submit Report" onPress={jest.fn()} disabled />,
    );

    const button = getByRole('button');
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    expect(button.props.className).toContain('bg-disabled-bg');
    expect(getByText('Submit Report').props.className).toContain('text-disabled-text');
  });

  it('does not fire while loading, and hides the label', async () => {
    const onPress = jest.fn();
    const { getByRole, queryByText } = await render(
      <Button variant="primary" size="md" label="Send SOS" onPress={onPress} loading />,
    );

    await fireEvent.press(getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
    expect(queryByText('Send SOS')).toBeNull();
  });

  it('falls back to the label for its accessibility name', async () => {
    const { getByLabelText } = await render(
      <Button variant="secondary" size="sm" label="Cancel" onPress={jest.fn()} />,
    );
    expect(getByLabelText('Cancel')).toBeTruthy();
  });

  it('uses an explicit accessibility label when provided', async () => {
    const { getByLabelText } = await render(
      <Button
        variant="danger"
        size="lg"
        label="X"
        onPress={jest.fn()}
        accessibilityLabel="Cancel the SOS countdown"
      />,
    );
    expect(getByLabelText('Cancel the SOS countdown')).toBeTruthy();
  });

  it.each(['primary', 'secondary', 'outline', 'ghost', 'danger'] as const)(
    'renders the %s variant with icons',
    async (variant) => {
      const { getByText } = await render(
        <Button
          variant={variant}
          size="md"
          label="Go"
          onPress={jest.fn()}
          leftIcon="call"
          rightIcon="chevron-forward"
          fullWidth
        />,
      );
      expect(getByText('Go')).toBeTruthy();
    },
  );
});
