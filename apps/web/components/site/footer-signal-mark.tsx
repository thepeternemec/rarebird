import { useId } from "react";
import { RAREBIRD_EMBLEM_PATH } from "./brand-mark";

const CELL = 16;
const COLUMNS = 40;
const ROWS = 16;
const EMBLEM_TRANSFORM = "translate(209 40) scale(2)";
const tiles = Array.from({ length: COLUMNS * ROWS }, (_, index) => {
  const column = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  const seed = ((column + 13) * 7919 ^ (row + 5) * 3571) % 97;
  return {
    x: column * CELL + 2,
    y: row * CELL + 2,
    opacity: seed < 38 ? .16 : seed < 70 ? .37 : seed < 90 ? .59 : .82,
  };
});

export default function FooterSignalMark() {
  const id = useId();
  const outlineId = `${id}-outline`;
  const patternId = `${id}-pattern`;
  const shadeId = `${id}-shade`;

  return (
    <svg className="rb-footer-art" viewBox={`0 0 ${COLUMNS * CELL} ${ROWS * CELL}`} aria-hidden="true" focusable="false">
      <defs>
        <path id={outlineId} d={RAREBIRD_EMBLEM_PATH} transform={EMBLEM_TRANSFORM} fillRule="evenodd" />
        <pattern id={patternId} width={CELL} height={CELL} patternUnits="userSpaceOnUse">
          <rect x="2" y="2" width="12" height="12" rx="2.5" fill="white" />
        </pattern>
        <mask id={`${id}-tiles`} x="0" y="0" width={COLUMNS * CELL} height={ROWS * CELL} maskUnits="userSpaceOnUse">
          <rect width={COLUMNS * CELL} height={ROWS * CELL} fill={`url(#${patternId})`} />
        </mask>
        <linearGradient id={shadeId} x2="1" y2="1">
          <stop stopColor="var(--footer-mark-highlight)" />
          <stop offset="1" stopColor="var(--footer-mark-base)" />
        </linearGradient>
      </defs>
      <g className="rb-footer-art-field" fill="var(--footer-cell)">
        {tiles.map(({ x, y, opacity }) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="12" height="12" rx="2.5" opacity={opacity} />
        ))}
      </g>
      <use href={`#${outlineId}`} fill="var(--footer-mark-base)" opacity=".24" />
      <use href={`#${outlineId}`} fill={`url(#${shadeId})`} mask={`url(#${id}-tiles)`} className="rb-footer-art-emblem" />
    </svg>
  );
}
