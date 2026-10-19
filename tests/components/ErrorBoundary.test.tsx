import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';

import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Text } from '@/components/ui/Text';
import { captureException } from '@/config/sentry';

jest.mock('@/config/sentry', () => ({ captureException: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}));

function Boom(): React.JSX.Element {
  throw new Error('render exploded');
}

describe('ErrorBoundary', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    // React logs the caught error itself; keep the expected noise out of output.
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.mocked(captureException).mockClear();
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('renders children when nothing throws', async () => {
    const { getByText } = await render(
      <ErrorBoundary>
        <Text variant="body">All good</Text>
      </ErrorBoundary>,
    );
    expect(getByText('All good')).toBeTruthy();
  });

  it('shows the fallback and reports to Sentry when a child throws', async () => {
    const { getByText } = await render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(getByText('Something went wrong')).toBeTruthy();
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ domain: 'UI', operation: 'render' }),
    );
  });

  it('offers a retry control on the fallback', async () => {
    const onReset = jest.fn();
    const { getByText } = await render(
      <ErrorBoundary onReset={onReset}>
        <Boom />
      </ErrorBoundary>,
    );

    expect(() => fireEvent.press(getByText('Try again'))).not.toThrow();
    expect(onReset).toHaveBeenCalled();
  });

  it('offers a Go to Home action on the fallback', async () => {
    const { getByText } = await render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(() => fireEvent.press(getByText('Go to Home'))).not.toThrow();
  });

  it('offers an emergency call action on the fallback', async () => {
    const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { getByText } = await render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    await fireEvent.press(getByText('Call 112 (Emergency Helpline)'));
    expect(openURLSpy).toHaveBeenCalledWith('tel:112');
    openURLSpy.mockRestore();
  });

  it('renders custom fallback when provided', async () => {
    const { getByText } = await render(
      <ErrorBoundary fallback={<Text variant="body">Custom Error Screen</Text>}>
        <Boom />
      </ErrorBoundary>,
    );

    expect(getByText('Custom Error Screen')).toBeTruthy();
  });
});
