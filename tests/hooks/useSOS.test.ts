import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { checkSmsPermission } from 'surakshak-native';

import { APP_CONFIG } from '@/constants/config';
import { useSOS } from '@/hooks/useSOS';
import * as analytics from '@/services/analytics.service';
import * as locationService from '@/services/location.service';
import * as smsService from '@/services/sms.service';
import { useSOSStore } from '@/stores/sos.store';
import { requestSmsPermission } from '@/utils/permissions.utils';

jest.mock('@/services/sms.service', () => ({
  sendSOSAlert: jest.fn(() => Promise.resolve({ sent: ['+919876543210'], failed: [] })),
  recordSMSAlert: jest.fn(() => Promise.resolve({ id: 'r1' })),
}));

jest.mock('@/services/location.service', () => ({
  getLocationWithTimeout: jest.fn(() =>
    Promise.resolve({ latitude: 1, longitude: 2, timestamp: 0 }),
  ),
  buildLocationUrl: jest.fn(() => 'https://maps/here'),
}));

jest.mock('@/utils/permissions.utils', () => ({
  requestSmsPermission: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('@/services/analytics.service', () => ({
  trackSosTriggered: jest.fn(),
  trackSosCancelled: jest.fn(),
  trackSmsAlertSent: jest.fn(),
}));

// RNTL 14 made `renderHook` and `act` async — both must be awaited.
describe('useSOS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useSOSStore.getState().reset();
  });

  afterEach(async () => {
    await act(() => {
      useSOSStore.getState().reset();
      jest.clearAllTimers();
    });
    jest.useRealTimers();
    Platform.OS = 'ios';
  });

  async function elapseCountdown(): Promise<void> {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(APP_CONFIG.SOS_COUNTDOWN_SECONDS * 1000);
    });
  }

  it('starts inactive with a full countdown', async () => {
    const { result } = await renderHook(() => useSOS());

    expect(result.current.isActive).toBe(false);
    expect(result.current.countdown).toBe(APP_CONFIG.SOS_COUNTDOWN_SECONDS);
  });

  it('a triple-tap inside the window starts the countdown', async () => {
    const { result } = await renderHook(() => useSOS());

    await act(() => {
      result.current.handleTap();
      result.current.handleTap();
      result.current.handleTap();
    });

    expect(result.current.isActive).toBe(true);
    expect(result.current.triggerMethod).toBe('button');
  });

  it('a single tap does not start the countdown', async () => {
    const { result } = await renderHook(() => useSOS());

    await act(() => {
      result.current.handleTap();
    });

    expect(result.current.isActive).toBe(false);
  });

  it('decrements the countdown once per second', async () => {
    const { result } = await renderHook(() => useSOS());

    await act(() => {
      result.current.trigger('shake');
    });
    await act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.countdown).toBe(APP_CONFIG.SOS_COUNTDOWN_SECONDS - 1);
  });

  it('fans out SMS, records the alert and resets when the countdown elapses', async () => {
    const { result } = await renderHook(() => useSOS());

    await act(() => {
      result.current.trigger('button');
    });
    await act(async () => {
      jest.advanceTimersByTime(APP_CONFIG.SOS_COUNTDOWN_SECONDS * 1000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(smsService.sendSOSAlert).toHaveBeenCalledTimes(1);
    expect(smsService.recordSMSAlert).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sos', locationUrl: 'https://maps/here' }),
    );
    expect(analytics.trackSmsAlertSent).toHaveBeenCalledWith('sos', 1, 0);
    expect(useSOSStore.getState().isActive).toBe(false);
  });

  it('cancel stops the countdown and clears the store', async () => {
    const { result } = await renderHook(() => useSOS());

    await act(() => {
      result.current.trigger('button');
    });
    await act(() => {
      result.current.cancel();
    });

    expect(analytics.trackSosCancelled).toHaveBeenCalledWith('button');
    expect(result.current.isActive).toBe(false);
    expect(result.current.countdown).toBe(APP_CONFIG.SOS_COUNTDOWN_SECONDS);

    // The interval is gone — advancing time does not fan out.
    await act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(smsService.sendSOSAlert).not.toHaveBeenCalled();
  });

  it('switches to a non-cancellable sending state at zero instead of freezing', async () => {
    let finishSend: (value: { sent: string[]; failed: string[] }) => void = () => undefined;
    jest.mocked(smsService.sendSOSAlert).mockReturnValueOnce(
      new Promise((resolve) => {
        finishSend = resolve;
      }),
    );
    const { result } = await renderHook(() => useSOS());

    await act(() => {
      result.current.trigger('button');
    });
    await elapseCountdown();

    expect(result.current.isSending).toBe(true);
    expect(result.current.isActive).toBe(true);

    await act(() => {
      result.current.cancel();
    });
    expect(result.current.isSending).toBe(true);
    expect(analytics.trackSosCancelled).not.toHaveBeenCalled();

    await act(async () => {
      finishSend({ sent: ['+919876543210'], failed: [] });
      await Promise.resolve();
    });
    expect(result.current.isActive).toBe(false);
    expect(result.current.isSending).toBe(false);
  });

  it('records the send outcome for the dashboard to report', async () => {
    jest
      .mocked(smsService.sendSOSAlert)
      .mockResolvedValueOnce({ sent: ['+919876543210'], failed: ['+918765432109'] });
    const { result } = await renderHook(() => useSOS());

    await act(() => {
      result.current.trigger('button');
    });
    await elapseCountdown();

    expect(useSOSStore.getState().lastOutcome).toEqual({ sent: 1, failed: 1, error: null });
  });

  it('records error: failed when the dispatch throws an exception', async () => {
    jest.mocked(smsService.sendSOSAlert).mockRejectedValueOnce(new Error('Network failure'));
    const { result } = await renderHook(() => useSOS());

    await act(() => {
      result.current.trigger('button');
    });
    await elapseCountdown();

    expect(useSOSStore.getState().lastOutcome).toEqual({ sent: 0, failed: 0, error: 'failed' });
  });

  it('multiple mounted hook instances do not run duplicate intervals', async () => {
    const hook1 = await renderHook(() => useSOS());
    const hook2 = await renderHook(() => useSOS());

    await act(() => {
      hook1.result.current.trigger('button');
    });
    await act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Decremented exactly once (from 5 to 4), not twice
    expect(hook1.result.current.countdown).toBe(APP_CONFIG.SOS_COUNTDOWN_SECONDS - 1);
    expect(hook2.result.current.countdown).toBe(APP_CONFIG.SOS_COUNTDOWN_SECONDS - 1);
  });

  it('still sends, without a location, when no fix is available', async () => {
    jest
      .mocked(locationService.getLocationWithTimeout)
      .mockRejectedValueOnce(new Error('errors.locationUnavailable'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result } = await renderHook(() => useSOS());

    await act(() => {
      result.current.trigger('button');
    });
    await elapseCountdown();

    expect(smsService.sendSOSAlert).toHaveBeenCalledWith(
      expect.anything(),
      'Location unavailable',
      expect.anything(),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it('asks for SEND_SMS on Android when the countdown starts without the grant', async () => {
    Platform.OS = 'android';
    jest.mocked(checkSmsPermission).mockResolvedValueOnce(false);
    const { result } = await renderHook(() => useSOS());

    await act(async () => {
      result.current.trigger('button');
      await Promise.resolve();
    });

    expect(requestSmsPermission).toHaveBeenCalledTimes(1);
  });

  it('does not ask for SEND_SMS when it is already granted', async () => {
    Platform.OS = 'android';
    const { result } = await renderHook(() => useSOS());

    await act(async () => {
      result.current.trigger('button');
      await Promise.resolve();
    });

    expect(requestSmsPermission).not.toHaveBeenCalled();
  });
});
