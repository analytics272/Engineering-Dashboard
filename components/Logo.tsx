/* eslint-disable @next/next/no-img-element */

/**
 * Skyla mark — the real logo asset (public/skyla-icon-white.png), already
 * transparent-background. White silhouette, sized for the teal sidebar.
 */
export function Logo({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/skyla-icon-white.png"
      alt="Skyla"
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', objectFit: 'contain' }}
    />
  );
}
