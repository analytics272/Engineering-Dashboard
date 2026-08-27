/**
 * Skyla mark — inline SVG recreation of the 5-point rounded-star logo.
 * Transparent background (the source PNG's white is dropped); scales cleanly;
 * takes its colour from `currentColor`.
 */
export function Logo({ size = 26, className }: { size?: number; className?: string }) {
  const STAR =
    'M50,6 L60.58,35.44 L91.85,36.4 L67.12,55.56 L75.86,85.6 ' +
    'L50,68 L24.14,85.6 L32.88,55.56 L8.15,36.4 L39.42,35.44 Z';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Skyla"
    >
      <mask id="skyla-cut">
        <rect width="100" height="100" fill="#000" />
        <path d={STAR} fill="#fff" stroke="#fff" strokeWidth="7" strokeLinejoin="round" />
        <path
          d={STAR}
          fill="#000"
          stroke="#000"
          strokeWidth="6"
          strokeLinejoin="round"
          transform="translate(50 50) rotate(36) scale(0.5) translate(-50 -50)"
        />
      </mask>
      <rect width="100" height="100" fill="currentColor" mask="url(#skyla-cut)" />
    </svg>
  );
}
