import type { CSSProperties } from "react";

export default function SignalTiles({ cells }: { cells: string }) {
  return (
    <span className="rb-signal-tiles" aria-hidden="true" style={{ "--tile-count": cells.length } as CSSProperties}>
      {Array.from(cells, (level, index) => (
        <i key={index} data-level={level} style={{ "--tile-delay": `${index * 46}ms` } as CSSProperties} />
      ))}
    </span>
  );
}
