'use client';

import { useEffect, useRef, useState } from 'react';

interface PosShortcutOptions {
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

function focusInput(id: string): void {
  const element = document.getElementById(id);
  if (element instanceof HTMLInputElement) {
    element.focus();
    element.select();
  }
}

/**
 * Function keys stay available while the search or payment field is focused so
 * the whole sale can run from the keyboard. Quantity shortcuts use Ctrl+Arrow
 * because bare +/- are legitimate barcode characters.
 */
export function usePosShortcuts(options: PosShortcutOptions) {
  const [helpOpen, setHelpOpen] = useState(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape' && helpOpen) {
        event.preventDefault();
        setHelpOpen(false);
        return;
      }
      if (helpOpen) return;

      const current = optionsRef.current;
      if (current.disabled) return;
      if (event.repeat && event.key.startsWith('F')) return;

      switch (event.key) {
        case 'F1':
          event.preventDefault();
          setHelpOpen(true);
          return;
        case 'F2':
          event.preventDefault();
          focusInput('product-search');
          return;
        case 'F4':
          event.preventDefault();
          focusInput('tender-input');
          return;
        case 'F6':
          if (current.canPause) {
            event.preventDefault();
            current.onPause();
          }
          return;
        case 'F7':
          if (current.hasPaused) {
            event.preventDefault();
            current.onOpenPaused();
          }
          return;
        case 'F8':
          if (current.hasCart) {
            event.preventDefault();
            current.onRemoveLast();
          }
          return;
        case 'F9':
          if (current.canCharge) {
            event.preventDefault();
            current.onCharge();
          }
          return;
        default:
          break;
      }

      if (event.ctrlKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        if (!current.hasCart) return;
        event.preventDefault();
        current.onAdjustLast(event.key === 'ArrowUp' ? 1 : -1);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [helpOpen]);

  return {
    helpOpen,
    closeHelp: () => setHelpOpen(false),
  };
}
