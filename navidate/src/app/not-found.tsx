import Link from "next/link";
export default function NotFound() {
  return (
    <main className="empty">
      <h1>This date took a detour.</h1>
      <p>The itinerary may be missing or the link may be incomplete.</p>
      <Link className="primary" href="/">
        Plan a new date
      </Link>
    </main>
  );
}
