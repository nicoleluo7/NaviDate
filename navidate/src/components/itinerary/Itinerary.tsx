"use client";
import { Button } from "react-aria-components";
import { useState } from "react";
import {
  ArrowUpRight,
  Footprints,
  Copy,
  Heart,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import type { Plan } from "@/types";
import { displayTime } from "@/lib/planner/time";
import { directionsToPlace, routeUrlForPlan } from "@/lib/maps/googleMapsUrl";
import { formatDuration, formatWalkMiles } from "@/components/ui/format";
import WeatherPanel from "./WeatherPanel";
import MapLoader from "@/components/map/MapLoader";

export default function Itinerary({
  plan,
  onSwap,
  onSave,
  saveLabel = "Save & Share",
  saving = false,
  dirty = false,
  busy = false,
  savedUrl,
  shareId,
  canPair = false,
  photon = false,
  variant = "planner",
}: {
  plan: Plan;
  onSwap?: (index: number) => void;
  onSave?: () => void;
  busy?: boolean;
  saving?: boolean;
  dirty?: boolean;
  saveLabel?: string;
  savedUrl?: string;
  shareId?: string;
  canPair?: boolean;
  photon?: boolean;
  variant?: "planner" | "share";
}) {
  const [selected, setSelected] = useState<number | null>(null),
    [focus, setFocus] = useState(0),
    [tab, setTab] = useState("timeline"),
    [notice, setNotice] = useState(""),
    [pairCode, setPairCode] = useState(""),
    [pairLink, setPairLink] = useState(""),
    [phone, setPhone] = useState(""),
    [pairing, setPairing] = useState(false);
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
  const routeUrl = plan.googleMapsUrl ?? routeUrlForPlan(plan);
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
    routeUrl ?? "",
    savedUrl ?? "",
  ].join("\n");
  async function pair() {
    if (!phone.trim()) {
      setNotice("Enter the phone number you use with iMessage.");
      return;
    }
    setPairing(true);
    try {
      const r = await fetch("/api/pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shareId, phone }),
        }),
        data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setPairCode(data.code);
      setPairLink(data.link);
      setNotice(data.instruction);
      if (data.link) window.location.assign(data.link);
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Could not create pairing code.",
      );
    } finally {
      setPairing(false);
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
  const share = variant === "share";
  return (
    <section className="itinerary" aria-label="Selected itinerary">
      {!share && (
        <div className="itinerary-heading">
          <div>
            <h2>Your date ✨</h2>
            <p className="plan-kicker">{plan.title}</p>
          </div>
        </div>
      )}
      {share && (
        <div className="itinerary-heading invite-plan-heading">
          <div>
            <h2>{plan.title}</h2>
            <p>
              {displayTime(plan.startsAt)} — {displayTime(plan.endsAt)} · $
              {plan.cost} for two
            </p>
          </div>
        </div>
      )}
      <div className="mobile-tabs" role="group" aria-label="Itinerary view">
        <Button
          aria-pressed={tab === "timeline"}
          onPress={() => setTab("timeline")}
        >
          Timeline
        </Button>
        <Button aria-pressed={tab === "map"} onPress={() => setTab("map")}>
          Map
        </Button>
      </div>
      <div className="itinerary-grid">
        <div className={`timeline ${tab === "map" ? "mobile-hidden" : ""}`}>
          <div className="start-row">
            <span className="timeline-dot start-dot">S</span>
            <div>
              <strong>{plan.start.name}</strong>
              <small>Meet at {displayTime(plan.startsAt)}</small>
            </div>
          </div>
          {plan.stops.map((s, i) => (
            <div className="timeline-step" key={s.place.id}>
              {plan.legs[i] && (
                <div className="travel">
                  <Footprints size={14} />
                  {plan.legs[i]?.mode === "bus"
                    ? `Bus ${plan.legs[i].bus?.route} · ${plan.legs[i].minutes} min incl. walking & waiting`
                    : `${plan.legs[i]?.minutes ?? 0} min walk`}
                </div>
              )}
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
                <Button
                  className="stop-select"
                  onPress={() => choose(i)}
                  aria-pressed={selected === i}
                  aria-label={
                    selected === i
                      ? `Show the whole route instead of ${s.place.name}`
                      : `Center the map on ${s.place.name}`
                  }
                >
                  <span className="stop-number">{i + 1}</span>
                  <div>
                    <time>{displayTime(s.arrival)}</time>
                    <h3>{s.place.name}</h3>
                  </div>
                </Button>
                <p>{s.place.description}</p>
                <div className="stop-meta">
                  <span>{s.place.typicalDurationMinutes} min</span>
                  <span>
                    {s.place.estimatedCostForTwo === 0
                      ? "Free"
                      : `$${s.place.estimatedCostForTwo}`}
                  </span>
                  <span className="stop-category">{s.place.category}</span>
                </div>
                <small>
                  Leave {displayTime(s.departure)} ·{" "}
                  {s.place.openingHours
                    ? "Published hours checked"
                    : "Hours unverified"}
                </small>
                <div className="stop-actions">
                  <a
                    href={directionsToPlace(s.place)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Directions <ArrowUpRight size={14} />
                  </a>
                  <a href={s.place.sourceUrl} target="_blank" rel="noreferrer">
                    {s.place.googlePlaceId
                      ? "Google Maps place"
                      : "Venue source"}{" "}
                    <ArrowUpRight size={14} />
                  </a>
                  {onSwap && (
                    <Button isDisabled={busy} onPress={() => onSwap(i)}>
                      Swap
                    </Button>
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
        </div>
        <div
          className={`map-column ${tab === "timeline" ? "mobile-hidden" : ""}`}
        >
          <div className="map-card">
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
          </div>
          <div className="map-stop">
            {selected == null ? (
              <>
                <span className="eyebrow">WHOLE ROUTE</span>
                <h3>Every stop</h3>
                <p>
                  Select a numbered pin to see the place. Show all stops to get
                  your bearings.
                </p>
              </>
            ) : (
              <>
                <span className="eyebrow">STOP {selected + 1}</span>
                <h3>{plan.stops[selected]?.place.name}</h3>
                <p>{plan.stops[selected]?.place.address}</p>
                <p>
                  {displayTime(plan.stops[selected].arrival)} ·{" "}
                  {plan.stops[selected].place.typicalDurationMinutes} minutes ·{" "}
                  {plan.stops[selected].place.estimatedCostForTwo
                    ? `Est. $${plan.stops[selected].place.estimatedCostForTwo} for two`
                    : "Free"}
                </p>
                <a
                  className="map-directions"
                  target="_blank"
                  rel="noreferrer"
                  href={directionsToPlace(plan.stops[selected].place)}
                >
                  Directions to this stop <ArrowUpRight size={16} />
                </a>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="itinerary-support">
        <aside className="why-navi">
          <h3>
            <Sparkles size={18} /> Why Navi chose this
          </h3>
          <div className="why-navi-stats" aria-label="Plan summary">
            <span>💵 ${plan.cost} for two</span>
            <span>⏱ {formatDuration(plan.duration)}</span>
            <span>🚶 {formatWalkMiles(plan.walkKm)}</span>
          </div>
          <dl className="why-navi-details">
            <div>
              <dt>The idea</dt>
              <dd>{plan.explanation}</dd>
            </div>
            <div>
              <dt>The fit</dt>
              <dd>{plan.suitability}</dd>
            </div>
          </dl>
          {plan.warnings.length > 0 && (
            <ul>
              {plan.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </aside>
        <WeatherPanel weather={plan.weather} />
      </div>
      {canPair && photon && shareId && (
        <label className="pair-phone">
          <span>Enter the phone number you use with iMessage</span>
          <input
            type="tel"
            name="imessage-phone"
            autoComplete="tel"
            inputMode="tel"
            placeholder="+1 607 555 0100"
            value={phone}
            disabled={pairing}
            onChange={(event) => setPhone(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void pair();
              }
            }}
          />
          <small className="field-help">
            We’ll connect this number, then open a ready-to-send pairing text.
          </small>
        </label>
      )}
      <div className="action-bar">
        {routeUrl && (
          <a className="primary" href={routeUrl} target="_blank" rel="noreferrer">
            Open in Google Maps
            <ArrowUpRight size={17} />
          </a>
        )}
        {canPair && (
          <Button
            className="secondary"
            onPress={pair}
            isDisabled={!photon || !shareId || dirty || busy || pairing}
          >
            <MessageCircle size={17} />
            {pairing ? "Connecting…" : "Send to iMessage"}
          </Button>
        )}
        {onSave && (
          <Button className="secondary" onPress={onSave} isDisabled={busy}>
            <Heart size={17} />
            {saving ? "Saving…" : saveLabel}
          </Button>
        )}
        {savedUrl && (
          <Button
            className="secondary"
            onPress={() => copy(savedUrl)}
            isDisabled={dirty || busy}
          >
            <Copy size={17} />
            Copy share link
          </Button>
        )}
      </div>
      {canPair && !photon && (
        <p className="muted small">
          iMessage isn’t connected yet. You can copy the share link instead.
        </p>
      )}
      {canPair && photon && !shareId && (
        <p className="muted small">Save your date to connect it to iMessage.</p>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
          {pairLink && <a href={pairLink}>Open Messages again</a>}
          {pairCode && (
            <Button onPress={checkPair}>Check pairing status</Button>
          )}
        </div>
      )}
      {!share && (
        <details className="copy-text">
          <summary>View copyable itinerary text</summary>
          <textarea
            readOnly
            value={summary}
            aria-label="Copyable itinerary text"
            rows={10}
          />
        </details>
      )}
    </section>
  );
}
