"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "react-aria-components";
import { LocateFixed, MessageCircle, Copy } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { locationError, locationFromPosition } from "@/lib/location";
import type { Criteria } from "@/types";
export default function LocationShare({ address }: { address: string }) {
  const [point, setPoint] = useState<Criteria["start"]>(),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  function locate() {
    setNotice("");
    if (!window.isSecureContext || !navigator.geolocation) {
      setNotice(
        "Location needs HTTPS or localhost. You can still tell Navi a nearby Ithaca landmark.",
      );
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        try {
          setPoint(locationFromPosition(p));
          setNotice("Location found. Send it to Navi when you’re ready.");
        } catch (e) {
          setNotice(e instanceof Error ? e.message : "Please try again.");
        } finally {
          setBusy(false);
        }
      },
      (e) => {
        setNotice(locationError(e.code));
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }
  const text = point
    ? `Start from my location: ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`
    : "";
  return (
    <main className="location-share">
      <Link href="/" aria-label="Navidate home">
        <BrandMark size={64} />
      </Link>
      <h1>Start right here.</h1>
      <p>
        Share your current location with Navi, so your date begins where you
        are.
      </p>
      <Button className="primary" onPress={locate} isDisabled={busy}>
        <LocateFixed size={18} />
        {busy
          ? "Finding your location…"
          : point
            ? "Check location again"
            : "Use my current location"}
      </Button>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {point && (
        <div className="location-result">
          <p>
            {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
          </p>
          {address && (
            <a
              className="primary"
              href={`sms:${address}&body=${encodeURIComponent(text)}`}
            >
              <MessageCircle size={18} />
              Send location to Navi
            </a>
          )}
          <Button
            className="secondary"
            onPress={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setNotice("Copied. Paste it into your conversation with Navi.");
              } catch {
                setNotice("Copy the coordinates above and send them to Navi.");
              }
            }}
          >
            <Copy size={18} />
            Copy location
          </Button>
        </div>
      )}
      <p className="small muted">
        You choose whether to send. Navi uses these coordinates for your
        starting point and Google directions. Your precise start stays hidden on
        public itinerary pages.
      </p>
      <Link href="/">Or choose a landmark on Navidate</Link>
    </main>
  );
}
