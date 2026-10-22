'use client';

import { usePosShortcuts } from '../usePosShortcuts';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';

interface PosShortcutLayerProps {
  disabled: boolean;
  canPause: boolean;
  canCharge: boolean;
  hasCart: boolean;
  hasPaused: boolean;
  onPause: () => void;
  onOpenPaused: () => void;
  onCharge: () => void;
  onRemoveLast: () => void;
  onAdjustLast: (delta: 1 | -1) => void;
}

export function PosShortcutLayer(props: PosShortcutLayerProps) {
  const shortcuts = usePosShortcuts(props);
  return shortcuts.helpOpen ? <KeyboardShortcutsDialog onClose={shortcuts.closeHelp} /> : null;
}
