import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './BottomSheet.module.css';

/** Livelli del foglio: tracciati compatti / metà schermo / quasi pieno schermo. */
export type SheetLevel = 0 | 1 | 2;
const LEVELS = [0.3, 0.56, 0.9];

interface Props {
  level: SheetLevel;
  onLevel: (l: SheetLevel) => void;
  header: ReactNode;
  children: ReactNode;
}

/**
 * Bottom sheet trascinabile a tre livelli (verticale). In orizzontale diventa un pannello laterale
 * (gestito via CSS). Il trascinamento usa i pointer events sulla maniglia e aggancia al livello più vicino.
 */
export function BottomSheet({ level, onLevel, header, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; h0: number } | null>(null);
  const [dragH, setDragH] = useState<number | null>(null);
  const [vh, setVh] = useState(window.innerHeight);

  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { y0: e.clientY, h0: LEVELS[level]! * vh };
    },
    [level, vh],
  );
  const onMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    setDragH(Math.max(80, drag.current.h0 + (drag.current.y0 - e.clientY)));
  }, []);
  const onUp = useCallback(
    (e: React.PointerEvent) => {
      if (!drag.current) return;
      const moved = Math.abs(e.clientY - drag.current.y0);
      const h = dragH ?? drag.current.h0;
      drag.current = null;
      setDragH(null);
      if (moved < 6) {
        onLevel(((level + 1) % 3) as SheetLevel);
        return;
      }
      let best: SheetLevel = 0;
      LEVELS.forEach((f, i) => {
        if (Math.abs(f * vh - h) < Math.abs(LEVELS[best]! * vh - h)) best = i as SheetLevel;
      });
      onLevel(best);
    },
    [dragH, level, onLevel, vh],
  );

  const height = dragH ?? LEVELS[level]! * vh;
  return (
    <div
      ref={ref}
      className={styles.sheet}
      style={
        { '--sheet-h': `${height}px`, transition: dragH === null ? undefined : 'none' } as React.CSSProperties
      }
    >
      <div
        className={styles.handleArea}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="button"
        aria-label="Trascina per ridimensionare il pannello"
      >
        <div className={styles.handle} />
      </div>
      <div className={styles.header}>{header}</div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
