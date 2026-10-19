import React from 'react';

import { SOSCountdownOverlay } from '@/components/features/sos/SOSCountdownOverlay';
import { useSOS } from '@/hooks/useSOS';

/**
 * Root-level overlay mounted in `app/_layout.tsx` so the SOS countdown and
 * cancellation action are accessible across all screens and tabs, including
 * when SOS is activated remotely via suspicious-follow or shake detection.
 */
export function GlobalSOSOverlay(): React.JSX.Element | null {
  const { isActive, countdown, isSending, cancel } = useSOS();

  if (!isActive) return null;

  return <SOSCountdownOverlay countdown={countdown} isSending={isSending} onCancel={cancel} />;
}
