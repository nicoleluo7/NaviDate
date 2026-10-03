export default function BrandMark({ size = 38 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="465 590 1065 1065"
      aria-hidden="true"
      className="brand-mark"
    >
      <image href="/navidate-logo.png" width="2000" height="2000" />
    </svg>
  );
}
