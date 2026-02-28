import { useEffect } from 'react';

export function useKeyboardShortcuts(handlers: Record<string, () => void>) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = [
        e.ctrlKey || e.metaKey ? 'mod' : '',
        e.shiftKey ? 'shift' : '',
        e.key.toLowerCase(),
      ].filter(Boolean).join('+');

      if (handlers[key]) {
        e.preventDefault();
        handlers[key]();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
