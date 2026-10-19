import { installGlobalErrorHandler } from '@/utils/global-error-handler.utils';

describe('installGlobalErrorHandler', () => {
  const originalHandler = jest.fn();
  const mockErrorUtils = {
    getGlobalHandler: jest.fn(() => originalHandler),
    setGlobalHandler: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as { ErrorUtils?: unknown }).ErrorUtils = mockErrorUtils;
  });

  afterEach(() => {
    delete (globalThis as { ErrorUtils?: unknown }).ErrorUtils;
    delete (globalThis as { addEventListener?: unknown }).addEventListener;
    delete (globalThis as { removeEventListener?: unknown }).removeEventListener;
    delete (globalThis as { onunhandledrejection?: unknown }).onunhandledrejection;
  });

  it('wraps the existing handler, calling the new one first then the original', () => {
    const onError = jest.fn();
    installGlobalErrorHandler(onError);

    const installed = mockErrorUtils.setGlobalHandler.mock.calls[0]?.[0] as (
      error: unknown,
      isFatal?: boolean,
    ) => void;
    const error = new Error('boom');
    installed(error, true);

    expect(onError).toHaveBeenCalledWith(error);
    expect(originalHandler).toHaveBeenCalledWith(error, true);
  });

  it('returns a restore function that reinstates the original handler', () => {
    const restore = installGlobalErrorHandler(jest.fn());
    restore?.();

    expect(mockErrorUtils.setGlobalHandler).toHaveBeenLastCalledWith(originalHandler);
  });

  it('listens for unhandledrejection when addEventListener is available', () => {
    const addEventListener = jest.fn();
    const removeEventListener = jest.fn();
    (globalThis as { addEventListener?: unknown }).addEventListener = addEventListener;
    (globalThis as { removeEventListener?: unknown }).removeEventListener = removeEventListener;

    const onError = jest.fn();
    const restore = installGlobalErrorHandler(onError);

    expect(addEventListener).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));

    const listener = addEventListener.mock.calls[0]?.[1] as (event: { reason: unknown }) => void;
    const rejectionError = new Error('promise rejected');
    listener({ reason: rejectionError });

    expect(onError).toHaveBeenCalledWith(rejectionError);

    restore?.();
    expect(removeEventListener).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
  });

  it('returns undefined when neither ErrorUtils nor promise rejection listener is available', () => {
    delete (globalThis as { ErrorUtils?: unknown }).ErrorUtils;
    expect(installGlobalErrorHandler(jest.fn())).toBeUndefined();
  });
});
