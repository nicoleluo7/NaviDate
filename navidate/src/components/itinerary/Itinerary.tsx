"use client";
import { useState } from "react";
import {
  ArrowUpRight,
  Footprints,
  Clock,
  Wallet,
  CloudSun,
  Copy,
  Heart,
  RefreshCw,
  MapPin,
  MessageCircle,
} from "lucide-react";
import type { Plan } from "@/types";
import { displayTime } from "@/lib/planner/time";
import MapLoader from "@/components/map/MapLoader";
export default function Itinerary({
  plan,
  onSwap,
  onSave,
  busy = false,
  savedUrl,
  shareId,
  canPair = false,
  photon = false,
}: {
  plan: Plan;
  onSwap?: (index: number) => void;
  onSave?: () => void;
  busy?: boolean;
  savedUrl?: string;
  shareId?: string;
  canPair?: boolean;
  photon?: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null),
    [focus, setFocus] = useState(0),
    [tab, setTab] = useState("timeline"),
    [notice, setNotice] = useState(""),
    [pairCode, setPairCode] = useState("");
  function choose(index: number) {
    setSelected((current) => (current === index ? null : index));
    setFocus((n) => n + 1);
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copied to clipboard.");
    } catch {
      setNotice("Clipboard unavailable. Select and copy the text below.");
    }
  }
  const summary = [
    plan.title,
    `${displayTime(plan.startsAt)} – ${displayTime(plan.endsAt)}`,
    `Estimated $${plan.cost} for two`,
    ...plan.stops.map(
      (s, i) =>
        `${i + 1}. ${displayTime(s.arrival)} ${s.place.name} · ${s.place.typicalDurationMinutes} min · est. $${s.place.estimatedCostForTwo}`,
    ),
    plan.weather.summary,
    ...plan.warnings,
    savedUrl ?? "",
  ].join("\n");
  async function pair() {
    try {
      const r = await fetch("/api/pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shareId }),
        }),
        data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setPairCode(data.code);
      setNotice(data.instruction);
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Could not create pairing code.",
      );
    }
  }
  async function checkPair() {
    const r = await fetch("/api/pair?code=" + pairCode);
    const d = await r.json();
    setNotice(
      d.status === "accepted"
        ? "Photon accepted the reply. Delivery has not been independently confirmed."
        : `Pairing status: ${d.status ?? "unavailable"}. No delivery confirmation yet.`,
    );
  }
  return (
    <section className="itinerary" aria-label="Selected itinerary">
      <div className="itinerary-heading">
        <div>
          <span className="eyebrow">
            A LITTLE PLAN. A LOT TO LOOK FORWARD TO.
          </span>
          <h2>{plan.title}</h2>
          <p>
            {displayTime(plan.startsAt)} — {displayTime(plan.endsAt)}
          </p>
        </div>
        <Heart className="heart-outline" size={34} />
      </div>
      <div className="stat-row">
        <span>
          <Wallet size={17} /> ${plan.cost} for two <small>estimated</small>
        </span>
        <span>
          <Clock size={17} />
          {plan.duration} min
        </span>
        <span>
          <Footprints size={17} />
          {plan.walkKm} km
        </span>
        <span>
          <CloudSun size={17} />
          {plan.weather.summary}
        </span>
      </div>
      <div className="mobile-tabs" role="tablist" aria-label="Itinerary view">
        <button
          role="tab"
          aria-selected={tab === "timeline"}
          onClick={() => setTab("timeline")}
        >
          Timeline
        </button>
        <button
          role="tab"
          aria-selected={tab === "map"}
          onClick={() => setTab("map")}
        >
          Map
        </button>
      </div>
      <div className="itinerary-grid">
        <div className={`timeline ${tab === "map" ? "mobile-hidden" : ""}`}>
          <div className="start-row">
            <MapPin size={18} />
            <div>
              <strong>{plan.start.name}</strong>
              <small>Meet at {displayTime(plan.startsAt)}</small>
            </div>
          </div>
          {plan.stops.map((s, i) => (
            <div className="timeline-step" key={s.place.id}>
              <div className="travel">
                <Footprints size={14} />
                {plan.legs[i]?.mode === "bus"
                  ? `Bus ${plan.legs[i].bus?.route} · ${plan.legs[i].minutes} min incl. walking & waiting`
                  : `${plan.legs[i]?.minutes ?? 0} min walk · estimate`}
              </div>
              {plan.legs[i]?.bus && (
                <p className="bus-detail">
                  Scheduled: {plan.legs[i].bus!.boarding} →{" "}
                  {plan.legs[i].bus!.alighting}
                  <br />
                  {displayTime(plan.legs[i].bus!.boardTime)} –{" "}
                  {displayTime(plan.legs[i].bus!.alightTime)}
                  <br />
                  {plan.legs[i].bus!.wait} min wait · fare for two $
                  {plan.legs[i].cost}
                </p>
              )}
              <article
                className={`stop-card ${selected === i ? "selected" : ""}`}
              >
                <button
                  className="stop-select"
                  onClick={() => choose(i)}
                  aria-pressed={selected === i}
                  aria-label={
                    selected === i
                      ? `Show the whole route instead of ${s.place.name}`
                      : `Center the map on ${s.place.name}`
                  }
                >
                  <span className="stop-number">{i + 1}</span>
                  <div>
                    <span className="eyebrow">
                      {s.place.category} · {s.place.indoorOutdoor}
                    </span>
                    <h3>{s.place.name}</h3>
                  </div>
                </button>
                <p>{s.place.description}</p>
                <div className="stop-meta">
                  <span>{displayTime(s.arrival)}</span>
                  <span>{s.place.typicalDurationMinutes} min</span>
                  <span>
                    {s.place.estimatedCostForTwo === 0
                      ? "Free"
                      : `Est. $${s.place.estimatedCostForTwo} for two`}
                  </span>
                </div>
                <small>
                  Leave {displayTime(s.departure)} ·{" "}
                  {s.place.openingHours
                    ? "Published hours checked"
                    : "Hours unverified"}
                </small>
                <div className="stop-actions">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${s.place.coordinates.lat},${s.place.coordinates.lng}&travelmode=walking`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Directions <ArrowUpRight size={14} />
                  </a>
                  <a href={s.place.sourceUrl} target="_blank" rel="noreferrer">
                    Venue source <ArrowUpRight size={14} />
                  </a>
                  {onSwap && (
                    <button disabled={busy} onClick={() => onSwap(i)}>
                      <RefreshCw size={14} />
                      Try another place
                    </button>
                  )}
                </div>
              </article>
            </div>
          ))}
          {plan.legs.length > plan.stops.length && (
            <p className="travel">
              Return to start · {plan.legs.at(-1)!.minutes} min ·{" "}
              {plan.legs.at(-1)!.label}
            </p>
          )}
          <div className="end-row">
            <Heart size={16} /> A good date, well spent. Ends{" "}
            {displayTime(plan.endsAt)}
          </div>
        </div>
        <div
          className={`map-column ${tab === "timeline" ? "mobile-hidden" : ""}`}
        >
          <MapLoader
            plan={plan}
            selected={selected}
            focus={focus}
            onSelect={choose}
            onClear={() => {
              setSelected(null);
              setFocus((n) => n + 1);
            }}
          />
          <div className="map-stop">
            {selected == null ? (
              <>
                <span className="eyebrow">WHOLE ROUTE</span>
                <h3>Every stop</h3>
                <p>Click a stop to look closer. Click the map to zoom back out.</p>
              </>
            ) : (
              <>
                <span className="eyebrow">STOP {selected + 1}</span>
                <h3>{plan.stops[selected]?.place.name}</h3>
                <p>{plan.stops[selected]?.place.address}</p>
              </>
            )}
          </div>
          <p className="map-note">
            {plan.suitability}. No route line means travel is an estimate, not a
            verified walking path.
          </p>
        </div>
      </div>
      <details className="practical">
        <summary>Before you go · estimates & availability</summary>
        <ul>
          {plan.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <p>
          Weather: {plan.weather.source}. All times use America/New_York.
          Opening hours can change on holidays.
        </p>
      </details>
      <div className="action-bar">
        {onSave && (
          <button className="primary" onClick={onSave} disabled={busy}>
            <Heart size={17} />
            {busy ? "Saving…" : "Save this date"}
          </button>
        )}
        {savedUrl && (
          <button className="primary" onClick={() => copy(savedUrl)}>
            <Copy size={17} />
            Copy share link
          </button>
        )}
        <button className="secondary" onClick={() => copy(summary)}>
          <Copy size={17} />
          Copy itinerary
        </button>
        {canPair && (
          <button
            className="secondary"
            onClick={pair}
            disabled={!photon || !shareId}
          >
            <MessageCircle size={17} />
            Send to myself
          </button>
        )}
      </div>
      {canPair && !photon && (
        <p className="muted small">
          iMessage isn’t connected yet. You can copy the itinerary instead.
        </p>
      )}
      {canPair && photon && !shareId && (
        <p className="muted small">Save your date to connect it to iMessage.</p>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
          {pairCode && (
            <button onClick={checkPair}>Check pairing status</button>
          )}
        </div>
      )}
      <details className="copy-text">
        <summary>View copyable itinerary text</summary>
        <textarea
          readOnly
          value={summary}
          aria-label="Copyable itinerary text"
          rows={10}
        />
      </details>
    </section>
  );
}
