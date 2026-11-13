import { useRef, useState } from 'react';

export default function Splitter({
  onStart,
  onDrag,
  onDoubleClick,
  label,
}: {
  onStart: () => void;
  onDrag: (dx: number) => void;
  onDoubleClick: () => void;
  label: string;
}) {
  const startX = useRef(0);
  const active = useRef(false);
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        active.current = true;
        startX.current = event.clientX;
        setDragging(true);
        onStart();
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!active.current) return;
        onDrag(event.clientX - startX.current);
      }}
      onPointerUp={(event) => {
        active.current = false;
        setDragging(false);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        active.current = false;
        setDragging(false);
      }}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: '0 0 6px',
        width: 6,
        cursor: 'col-resize',
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
        touchAction: 'none',
      }}
    >
      <div
        style={{
          width: 1,
          height: '100%',
          background:
            hover || dragging ? 'var(--action-primary)' : 'transparent',
          transition: dragging ? 'none' : 'background 120ms ease',
        }}
      />
    </div>
  );
}
