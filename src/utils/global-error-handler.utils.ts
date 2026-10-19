/**
 * React Native polyfills a global `ErrorUtils` object (not exported by any
 * package as a value, only as a Flow/TS type), so it's read off `globalThis`
 * with a narrow, explicit shape instead of `any` or a `declare global`.
 */
type ErrorHandler = (error: unknown, isFatal?: boolean) => void;

interface GlobalErrorUtils {
  getGlobalHandler: () => ErrorHandler;
  setGlobalHandler: (handler: ErrorHandler) => void;
}

interface PromiseRejectionEvent {
  reason: unknown;
  promise: unknown;
}

function readErrorUtils(): GlobalErrorUtils | undefined {
  return (globalThis as { ErrorUtils?: GlobalErrorUtils }).ErrorUtils;
}

/**
 * Installs a handler that reports every otherwise-unhandled JS error and unhandled
 * Promise rejection to Sentry / Metro console before falling through to whatever
 * handler was already installed.
 * @returns a function that restores previous handlers; `undefined` if neither
 * `ErrorUtils` nor promise listeners are available.
 */
export function installGlobalErrorHandler(
  onError: (error: unknown) => void,
): (() => void) | undefined {
  const cleanupFns: (() => void)[] = [];

  const errorUtils = readErrorUtils();
  if (errorUtils !== undefined) {
    const originalHandler = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, isFatal) => {
      onError(error);
      originalHandler(error, isFatal);
    });
    cleanupFns.push(() => errorUtils.setGlobalHandler(originalHandler));
  }

  const globalObj = globalThis as unknown as {
    addEventListener?: (type: string, listener: (event: PromiseRejectionEvent) => void) => void;
    removeEventListener?: (type: string, listener: (event: PromiseRejectionEvent) => void) => void;
    onunhandledrejection?: ((event: PromiseRejectionEvent) => void) | undefined;
  };

  const handlePromiseRejection = (event: PromiseRejectionEvent): void => {
    const reason = event?.reason ?? new Error('Unhandled Promise Rejection');
    onError(reason);
  };

  if (typeof globalObj.addEventListener === 'function') {
    globalObj.addEventListener('unhandledrejection', handlePromiseRejection);
    cleanupFns.push(() => {
      globalObj.removeEventListener?.('unhandledrejection', handlePromiseRejection);
    });
  } else if ('onunhandledrejection' in globalObj) {
    const prevUnhandled = globalObj.onunhandledrejection;
    globalObj.onunhandledrejection = handlePromiseRejection;
    cleanupFns.push(() => {
      globalObj.onunhandledrejection = prevUnhandled;
    });
  }

  if (cleanupFns.length === 0) return undefined;

  return (): void => {
    for (const cleanup of cleanupFns) {
      cleanup();
    }
  };
}
