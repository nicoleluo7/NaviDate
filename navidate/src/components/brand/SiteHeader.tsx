import Link from "next/link";
import BrandMark from "@/components/BrandMark";

export default function SiteHeader({
  ctaHref = "#planner",
  ctaLabel = "Plan a date",
}: {
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <header className="site-header">
      <Link className="logo" href="/">
        <BrandMark size={34} />
        NaviDate
      </Link>
      <nav>
        <Link className="nav-cta" href={ctaHref}>
          {ctaLabel}
        </Link>
      </nav>
    </header>
  );
}
