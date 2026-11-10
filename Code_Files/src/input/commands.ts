// Tiny command bus. Voice, keyboard and on-screen buttons all emit the same commands,
// so every action is reachable through several modalities (flexibility / accessibility).
import { useEffect, useRef } from 'react';

export type Command = 'pause' | 'resume' | 'repeat' | 'help' | 'next' | 'back' | 'menu';

type Handler = (c: Command) => void;
const handlers = new Set<Handler>();

export function emitCommand(c: Command) { handlers.forEach((h) => h(c)); }

/** Subscribe to commands while the component is mounted. */
export function useCommands(map: Partial<Record<Command, () => void>>) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    const h: Handler = (c) => ref.current[c]?.();
    handlers.add(h);
    return () => { handlers.delete(h); };
  }, []);
}
