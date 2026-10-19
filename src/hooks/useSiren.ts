import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef } from 'react';

import { KEEP_AWAKE_TAGS } from '@/constants/ui';
import { trackSirenToggled } from '@/services/analytics.service';
import { useSOSStore } from '@/stores/sos.store';
import SIREN_SOURCE from '@assets/sounds/siren.wav';

import { startSiren, stopSiren } from '../../modules/surakshak-native/src';
export interface UseSirenResult {
  isActive: boolean;
  toggle: () => void;
}

const SIREN_VOLUME = 1;

/**
 * Drives the loud attention siren. State lives in `useSOSStore.isSirenActive`
 * so any screen sees the same on/off. Playback uses `expo-audio` via an
 * imperative player (kept in a ref so the loop flag can be set without
 * mutating a hook return); the screen stays awake while it runs and the siren
 * overrides the mute switch.
 */
export function useSiren(): UseSirenResult {
  const isActive = useSOSStore((state) => state.isSirenActive);
  const setSirenActive = useSOSStore((state) => state.setSirenActive);
  const playerRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    if (process.env.EXPO_OS === 'android') {
      return;
    }

    const player = createAudioPlayer(SIREN_SOURCE);
    player.loop = true;
    player.volume = SIREN_VOLUME;
    playerRef.current = player;

    return (): void => {
      player.pause();
      player.remove();
      playerRef.current = null;
    };
  }, []);
  useEffect(() => {
    const isAndroid = process.env.EXPO_OS === 'android';
    const player = playerRef.current;
    let cancelled = false;

    const startNativeSiren = async (): Promise<void> => {
      try {
        const { Asset } = await import('expo-asset');
        const asset = Asset.fromModule(SIREN_SOURCE);
        await asset.downloadAsync();

        if (cancelled || !asset.localUri) {
          return;
        }

        await startSiren(asset.localUri);

        // Stop playback if the siren was switched off during startup.
        if (cancelled) {
          await stopSiren();
        }
      } catch (error) {
        console.error('Failed to start native siren:', error);
      }
    };

    if (isActive) {
      if (isAndroid) {
        void startNativeSiren();
      } else if (player !== null) {
        void setAudioModeAsync({ playsInSilentMode: true });
        player.play();
      }

      void activateKeepAwakeAsync(KEEP_AWAKE_TAGS.SIREN);
    } else {
      if (isAndroid) {
        void stopSiren().catch((error) => {
          console.error('Failed to stop native siren:', error);
        });
      } else {
        player?.pause();
      }

      void deactivateKeepAwake(KEEP_AWAKE_TAGS.SIREN);
    }

    return (): void => {
      cancelled = true;
    };
  }, [isActive]);

  const toggle = useCallback((): void => {
    const next = !useSOSStore.getState().isSirenActive;
    setSirenActive(next);
    trackSirenToggled(next);
  }, [setSirenActive]);

  return { isActive, toggle };
}
