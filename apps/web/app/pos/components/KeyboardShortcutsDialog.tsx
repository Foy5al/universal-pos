'use client';

import { useEffect, useRef, type ReactNode } from 'react';

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--color-foreground)]">
      {children}
    </kbd>
  );
}

const steps: Array<{ title: string; keys: ReactNode; description: string }> = [
  {
    title: 'Find a product',
    keys: (
      <>
        <Key>F2</Key>
        <span>then type name, SKU or scan a barcode</span>
      </>
    ),
    description:
      'The search box is focused when the till opens. Use the arrow keys to choose from the results.',
  },
  {
    title: 'Add the highlighted product',
    keys: (
      <>
        <Key>↑</Key>
        <Key>↓</Key>
        <span>choose</span>
        <Key>Enter</Key>
        <span>add</span>
      </>
    ),
    description:
      'Enter adds an exact barcode or SKU match, otherwise the highlighted product. Scanning a barcode and pressing Enter keeps working.',
  },
  {
    title: 'Adjust the last line',
    keys: (
      <>
        <Key>Ctrl</Key>
        <Key>↑</Key>
        <span>/</span>
        <Key>Ctrl</Key>
        <Key>↓</Key>
      </>
    ),
    description:
      'Increases or decreases the quantity of the last item. Press F8 to remove it; if the admin enabled protection, the removal password is asked first.',
  },
  {
    title: 'Take payment',
    keys: (
      <>
        <Key>F4</Key>
        <span>type cash</span>
        <Key>Enter</Key>
      </>
    ),
    description:
      'Jumps to the payment field. Leave it blank to take the exact amount. Enter charges when the cart and shift are ready.',
  },
  {
    title: 'Hold this customer and serve the next',
    keys: (
      <>
        <Key>F6</Key>
        <span>pause</span>
        <Key>F7</Key>
        <span>resume</span>
      </>
    ),
    description:
      'Pausing keeps the captured prices and clears the counter for the next sale. Open paused sales with F7, then Tab to Resume sale and press Enter.',
  },
  {
    title: 'Charge the sale',
    keys: <Key>F9</Key>,
    description:
      'Posts the sale, prints the receipt and returns the counter to a new sale. Escape closes any open dialog.',
  },
];

export function KeyboardShortcutsDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-heading"
        className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <h2 id="keyboard-shortcuts-heading" className="text-lg font-semibold">
              Keyboard shortcuts
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Run the whole sale without leaving the keyboard.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="btn min-h-9 px-3 py-1.5 text-xs"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-lg border border-[var(--color-border)] p-3">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-xs font-semibold text-[var(--color-accent)]">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{step.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-muted)]">
                    {step.keys}
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-[var(--color-muted)]">
                    {step.description}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <p className="border-t border-[var(--color-border)] px-5 py-3 text-xs text-[var(--color-muted)]">
          Barcode scanners type into the focused search field, so scanning works at any point in
          this flow. Shortcuts are ignored while a password or paused-sale dialog is open.
        </p>
      </div>
    </div>
  );
}
