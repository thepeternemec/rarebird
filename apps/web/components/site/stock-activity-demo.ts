/** Illustration data for the homepage. The screener never reads this sequence. */
export const ACTIVITY_STEPS = [
  { label: "Scan", column: 10, duration: 2600, message: "Compare stock moves with the wider market." },
  { label: "Build", column: 24, duration: 2700, message: "Strength and unusual volume start to line up." },
  { label: "Qualify", column: 37, duration: 2200, message: "The spread passes the final check. A setup qualifies." },
  { label: "Alert", column: 48, duration: 3400, message: "Example NVDA alert ready for the agent." },
] as const;

export const ACTIVITY_GRID = Array.from({ length: 52 }, (_, column) => (
  Array.from({ length: 7 }, (_, row) => {
    const seed = ((column + 13) * 7919 ^ (row + 5) * 3571) % 97;
    const base = seed < 37 ? 0 : seed < 65 ? 1 : seed < 86 ? 2 : 3;
    return ACTIVITY_STEPS.map((step, index) => {
      const distance = Math.abs(column - step.column) + Math.abs(row - 3) * 2;
      const isAlert = index === 3 && column === step.column && row === 3;
      const cluster = column <= step.column + 2 && distance <= 6 + index;
      const level = cluster ? Math.max(base, distance <= 3 + index ? 4 : 2) : base;
      return { level, cluster, isAlert };
    });
  })
));
