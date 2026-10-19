import React from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Runs once the sheet has finished mounting/animating in, e.g. to reset form state. */
  onShow?: () => void;
  children: React.ReactNode;
}

// Same idiom as SafeScreen.tsx: iOS never resizes the window for the keyboard
// on its own, so a focused field needs explicit padding pushed up; Android's
// native resize already handles it. `Modal` renders in its own native root,
// so this must be applied here too rather than relying on a screen-level
// KeyboardAvoidingView, which never reaches Modal content.
const KEYBOARD_AVOIDING_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : undefined;

/**
 * Shared bottom-sheet shell for Modal-based forms: backdrop, rounded panel,
 * and keyboard-avoidance so a focused input is never hidden behind the
 * keyboard. Content scrolls, so a field near the bottom can also be scrolled
 * into view above the keyboard rather than only padded.
 */
export function BottomSheet({
  visible,
  onClose,
  onShow,
  children,
}: BottomSheetProps): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onShow={onShow}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        className="flex-1 justify-end"
        style={{ paddingTop: insets.top }}
        behavior={KEYBOARD_AVOIDING_BEHAVIOR}
      >
        <Pressable
          className="absolute inset-0 bg-near-black/40"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
        <ScrollView
          className="max-h-full w-full max-w-lg self-center rounded-t-3xl bg-off-white dark:bg-charcoal"
          contentContainerClassName="px-4 pt-6"
          contentContainerStyle={{ paddingBottom: 32 + insets.bottom }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
