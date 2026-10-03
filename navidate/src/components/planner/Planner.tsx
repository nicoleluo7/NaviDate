"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Navigation,
  MapPin,
  Heart,
  Footprints,
  Bus,
  Clock,
  Wallet,
  Sparkles,
  ChevronDown,
  LocateFixed,
  RefreshCw,
  Coffee,
  Palette,
  Trees,
} from "lucide-react";
import type { Criteria, Plan, PlanResult } from "@/types";
import landmarks from "../../../data/landmarks.json";
import MapLoader from "@/components/map/MapLoader";
import Itinerary from "@/components/itinerary/Itinerary";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const initial: Criteria = {
  start: landmarks[0],
  date: today(),
  time: "13:00",
  duration: 180,
  budget: 50,
  vibe: "Cozy",
  transport: "walk",
  dietary: [],
  setting: "any",
  maxWalkKm: 5,
  returnToStart: false,
  preferences: "",
};
export default function Planner({
  initialCriteria,
  editingShareId,
  photon = false,
  ai = false,
}: {
  initialCriteria?: Criteria;
  editingShareId?: string;
  photon?: boolean;
  ai?: boolean;
}) {
  const [criteria, setCriteria] = useState<Criteria>(
      initialCriteria ?? initial,
    ),
    [result, setResult] = useState<(PlanResult & { draftId: string }) | null>(
      null,
    ),
    [selected, setSelected] = useState<Plan | null>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [mapPicker, setMapPicker] = useState(false),
    [seed, setSeed] = useState(0),
    [saved, setSaved] = useState<{ url: string; shareId: string } | null>(null),
    [text, setText] = useState(""),
    [hint, setHint] = useState("");
  function update<K extends keyof Criteria>(key: K, value: Criteria[K]) {
    setCriteria((c) => ({ ...c, [key]: value }));
  }
  async function request(path: string, data: unknown) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Please try again.");
    return json;
  }
  async function generate() {
    setBusy("plan");
    setError("");
    setSaved(null);
    try {
      const r = await request("/api/plan", { criteria, seed });
      setResult(r);
      setSelected(null);
      setSeed((s) => s + 1);
      setTimeout(
        () =>
          document.getElementById("results")?.scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? "instant"
              : "smooth",
          }),
        100,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate plans.");
    } finally {
      setBusy("");
    }
  }
  async function save() {
    if (!selected || !result) return;
    setBusy("save");
    setError("");
    try {
      const d = await request("/api/save", {
        draftId: result.draftId,
        planId: selected.id,
        shareId: editingShareId,
      });
      setSaved({ url: location.origin + d.url, shareId: d.shareId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy("");
    }
  }
  async function swap(index: number) {
    if (!selected || !result) return;
    const shareId = saved?.shareId ?? editingShareId;
    const draftId = result.draftId;
    setBusy("swap");
    setError("");
    try {
      const d = await request("/api/swap", {
        draftId,
        planId: selected.id,
        index,
      });
      setSelected(d.plan);
      setResult((r) => {
        if (!r) return r;
        const match = r.plans.findIndex((p) => p === selected);
        const at =
          match === -1 ? r.plans.findIndex((p) => p.id === selected.id) : match;
        if (at < 0) return r;
        const plans = r.plans.slice();
        plans[at] = d.plan;
        return { ...r, plans };
      });
      if (!shareId) {
        setSaved(null);
        return;
      }
      try {
        const published = await request("/api/save", {
          draftId,
          planId: d.plan.id,
          shareId,
        });
        setSaved({
          url: location.origin + published.url,
          shareId: published.shareId,
        });
      } catch (e) {
        setSaved(null);
        throw e;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not replace this stop.");
    } finally {
      setBusy("");
    }
  }
  async function interpret() {
    setBusy("interpret");
    setError("");
    try {
      const d = await request("/api/interpret", { text });
      setCriteria((c) => ({ ...c, ...d.criteria }));
      setHint(
        d.question ??
          "Preferences filled in. Review the form, then find your date.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Use the form to continue.");
    } finally {
      setBusy("");
    }
  }
  function locate() {
    setHint("Finding your location…");
    if (!navigator.geolocation) {
      setHint("Location isn’t supported. Choose a landmark instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        update("start", {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          name: "My location",
          private: true,
        });
        setHint(
          "Location selected. Without a routing provider, choose a supported landmark if no route is found.",
        );
      },
      () =>
        setHint(
          "Location unavailable. You can still choose a landmark or a point on the map.",
        ),
      { timeout: 8000 },
    );
  }
  return (
    <>
      <header className="site-header">
        <Link className="logo" href="/">
          <Navigation fill="currentColor" size={25} />
          navidate<span>✳</span>
        </Link>
        <nav>
          <a href="#how">How it works</a>
          <a className="nav-cta" href="#planner">
            Plan a date <ArrowUpRight size={16} />
          </a>
        </nav>
      </header>
      <main>
        {!editingShareId && (
          <section className="hero">
            <div className="hero-copy">
              <div className="location-tag">
                <span /> CORNELL & ITHACA, NY
              </div>
              <h1>
                Less planning.
                <br />
                More <em>butterflies.</em>
              </h1>
              <p>
                Turn “What should we do?” into a date.
                <br />A few favorites, a little adventure, and a plan
                <br className="desktop-break" /> that gets you there together.
              </p>
              <a href="#planner" className="primary">
                Find your next date <ArrowRight size={18} />
              </a>
              <div className="hero-footnote">
                <Heart size={14} /> Made for two. No account needed.
              </div>
            </div>
            <div
              className="hero-art"
              aria-label="An illustrated date with coffee, a stroll, and something sweet"
            >
              <div className="art-label">THE BEST WAY IS TOGETHER ↗</div>
              <svg
                className="art-route"
                viewBox="0 0 460 390"
                aria-hidden="true"
              >
                <path
                  d="M90 85 C400 -10 425 170 260 200 S70 245 155 325"
                  fill="none"
                  stroke="#9baca0"
                  strokeWidth="2"
                  strokeDasharray="6 7"
                />
                <circle cx="90" cy="85" r="6" fill="#e66b55" />
                <circle cx="155" cy="325" r="6" fill="#e66b55" />
              </svg>
              <div className="art-ticket ticket-one">
                <span className="art-icon">
                  <Coffee size={34} />
                </span>
                <div>
                  <small>FIRST, A LITTLE</small>
                  <strong>Coffee & conversation</strong>
                  <span>Just your kind of cozy.</span>
                </div>
                <span className="ticket-num">01</span>
              </div>
              <div className="art-ticket ticket-two">
                <span className="art-icon green">
                  <Trees size={34} />
                </span>
                <div>
                  <small>THEN, THE SCENIC ROUTE</small>
                  <strong>Take the long way</strong>
                  <span>Good views. Better company.</span>
                </div>
                <span className="ticket-num">02</span>
              </div>
              <div className="art-ticket ticket-three">
                <Heart size={25} />
                <span>
                  Somewhere new.
                  <br />
                  <strong>Someone you like.</strong>
                </span>
              </div>
              <div className="art-stamp">
                a little
                <br />
                <strong>♥</strong>
                <br />
                closer
              </div>
            </div>
          </section>
        )}
        <section id="planner" className="planner-section">
          <div className="section-intro">
            <span className="eyebrow">
              {editingShareId
                ? "YOUR DATE, YOUR WAY"
                : "LET’S MAKE A LITTLE PLAN"}
            </span>
            <h2>
              {editingShareId
                ? "Give your date a new direction."
                : "What’s your kind of date?"}
            </h2>
            <p>
              You bring the company. We’ll help with the where, when, and how.
            </p>
          </div>
          <div className="form-card">
            {ai && (
              <div className="ai-input">
                <label htmlFor="natural">Tell us what you have in mind</label>
                <div>
                  <input
                    id="natural"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    maxLength={1000}
                    placeholder="A cozy afternoon near Cornell, under $50…"
                  />
                  <button
                    className="secondary"
                    type="button"
                    disabled={!!busy || !text}
                    onClick={interpret}
                  >
                    <Sparkles size={16} />
                    Fill my preferences
                  </button>
                </div>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void generate();
              }}
            >
              <div className="form-grid">
                <label className="wide">
                  <span>
                    <MapPin size={16} />
                    Where are we starting?
                  </span>
                  <select
                    value={criteria.start.id ?? "custom"}
                    onChange={(e) => {
                      const l = landmarks.find((x) => x.id === e.target.value);
                      if (l) update("start", l);
                    }}
                  >
                    {landmarks.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                    {!criteria.start.id && (
                      <option value="custom">{criteria.start.name}</option>
                    )}
                  </select>
                  <div className="location-actions">
                    <button
                      type="button"
                      onClick={() => setMapPicker((m) => !m)}
                    >
                      Choose on map
                    </button>
                    <button type="button" onClick={locate}>
                      <LocateFixed size={13} />
                      Use my location
                    </button>
                  </div>
                </label>
                <label>
                  <span>Date</span>
                  <input
                    type="date"
                    value={criteria.date}
                    required
                    onChange={(e) => update("date", e.target.value)}
                  />
                </label>
                <label>
                  <span>
                    Start time <small>New York</small>
                  </span>
                  <input
                    type="time"
                    value={criteria.time}
                    required
                    onChange={(e) => update("time", e.target.value)}
                  />
                </label>
                <label>
                  <span>
                    <Clock size={16} />
                    Time together
                  </span>
                  <select
                    value={criteria.duration}
                    onChange={(e) => update("duration", Number(e.target.value))}
                  >
                    {[60, 90, 120, 180, 240, 360, 480].map((n) => (
                      <option key={n} value={n}>
                        {n < 120 ? `${n} minutes` : `${n / 60} hours`}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>
                    <Wallet size={16} />
                    Total budget for two
                  </span>
                  <div className="money-input">
                    <span>$</span>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      required
                      value={criteria.budget}
                      onChange={(e) => update("budget", Number(e.target.value))}
                    />
                  </div>
                </label>
              </div>
              {mapPicker && (
                <div className="picker">
                  <MapLoader
                    point={criteria.start}
                    onPick={(p) => {
                      const l = landmarks.find(
                        (l) =>
                          Math.abs(l.lat - p.lat) < 0.0001 &&
                          Math.abs(l.lng - p.lng) < 0.0001,
                      );
                      update(
                        "start",
                        l ?? {
                          ...p,
                          name: "Selected map point",
                          private: true,
                        },
                      );
                      setHint(
                        l
                          ? "Supported landmark selected."
                          : "Point selected. Local paths may be unavailable here; a supported landmark is the most reliable starting point.",
                      );
                    }}
                  />
                  <p className="small muted">
                    Custom starting points are hidden from public share views.
                  </p>
                </div>
              )}
              <fieldset className="vibes">
                <legend>Set the mood</legend>
                <div>
                  {(
                    [
                      "Cozy",
                      "Romantic",
                      "Adventurous",
                      "Casual",
                      "Creative",
                    ] as const
                  ).map((v, i) => (
                    <button
                      type="button"
                      className={criteria.vibe === v ? "active" : ""}
                      key={v}
                      aria-pressed={criteria.vibe === v}
                      onClick={() => update("vibe", v)}
                    >
                      {i === 0 ? (
                        <Coffee size={17} />
                      ) : i === 1 ? (
                        <Heart size={17} />
                      ) : i === 2 ? (
                        <Navigation size={17} />
                      ) : i === 3 ? (
                        <Trees size={17} />
                      ) : (
                        <Palette size={17} />
                      )}{" "}
                      {v}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="transport-row">
                <span>Getting around</span>
                <div>
                  {(["walk", "bus"] as const).map((t) => (
                    <button
                      type="button"
                      key={t}
                      className={criteria.transport === t ? "active" : ""}
                      aria-pressed={criteria.transport === t}
                      onClick={() => update("transport", t)}
                    >
                      {t === "walk" ? (
                        <Footprints size={17} />
                      ) : (
                        <Bus size={17} />
                      )}{" "}
                      {t === "walk" ? "Walking" : "Walking + bus"}
                    </button>
                  ))}
                </div>
              </div>
              <details className="preferences">
                <summary>
                  A few more preferences <ChevronDown size={17} />
                </summary>
                <div className="form-grid">
                  <label>
                    <span>Indoor or outdoor?</span>
                    <select
                      value={criteria.setting}
                      onChange={(e) =>
                        update("setting", e.target.value as Criteria["setting"])
                      }
                    >
                      <option value="any">A little of either</option>
                      <option value="indoor">Indoor activities</option>
                      <option value="outdoor">Outdoor activities</option>
                    </select>
                  </label>
                  <label>
                    <span>Maximum walking (km)</span>
                    <input
                      type="number"
                      min={0.1}
                      max={20}
                      step={0.1}
                      value={criteria.maxWalkKm}
                      onChange={(e) =>
                        update("maxWalkKm", Number(e.target.value))
                      }
                    />
                  </label>
                </div>
                <fieldset className="dietary">
                  <legend>Dietary preferences · confirm with venues</legend>
                  {(["vegetarian", "vegan", "gluten-free"] as const).map(
                    (d) => (
                      <label key={d}>
                        <input
                          type="checkbox"
                          checked={criteria.dietary.includes(d)}
                          onChange={(e) =>
                            update(
                              "dietary",
                              e.target.checked
                                ? [...criteria.dietary, d]
                                : criteria.dietary.filter((x) => x !== d),
                            )
                          }
                        />
                        {d}
                      </label>
                    ),
                  )}
                </fieldset>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={criteria.returnToStart}
                    onChange={(e) => update("returnToStart", e.target.checked)}
                  />
                  End back where we started
                </label>
                <label>
                  <span>
                    Anything else? <small>Optional</small>
                  </span>
                  <textarea
                    maxLength={1000}
                    value={criteria.preferences}
                    onChange={(e) => update("preferences", e.target.value)}
                    placeholder="A quiet corner, a sweet treat, something unexpected…"
                  />
                </label>
              </details>
              <div className="form-footer">
                <p>
                  <Heart size={14} /> A thoughtful date starts here.
                </p>
                <button type="submit" className="primary" disabled={!!busy}>
                  {busy === "plan" ? "Finding your date…" : "Find our date"}
                  {busy === "plan" ? (
                    <RefreshCw className="spin" size={18} />
                  ) : (
                    <ArrowRight size={18} />
                  )}
                </button>
              </div>
            </form>
            {hint && (
              <p className="notice" role="status">
                {hint}
              </p>
            )}
          </div>
        </section>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {result && (
          <section id="results" className="results">
            <div className="section-intro">
              <span className="eyebrow">YOUR NEXT GOOD MEMORY</span>
              <h2>
                {result.plans.length
                  ? "A few ways to spend it together."
                  : "Let’s try another direction."}
              </h2>
              <p>
                {result.ai
                  ? "AI suggested ideas; the planner checked the schedule."
                  : "Made with our local planner and curated places."}
              </p>
            </div>
            {result.error && <div className="notice">{result.error}</div>}
            {result.notices.map((n) => (
              <p className="notice" key={n}>
                {n}
              </p>
            ))}
            <div className="plan-cards">
              {result.plans.map((p, i) => (
                <button
                  className={`plan-card ${selected?.id === p.id ? "chosen" : ""}`}
                  key={`${i}-${p.id}`}
                  onClick={() => {
                    setSelected(p);
                    setSaved(null);
                  }}
                >
                  <div className={`plan-art art-${i}`}>
                    <span>
                      {i === 0 ? (
                        <Coffee size={42} />
                      ) : i === 1 ? (
                        <Trees size={42} />
                      ) : (
                        <Palette size={42} />
                      )}
                    </span>
                    <small>OPTION 0{i + 1}</small>
                    <Heart size={20} />
                  </div>
                  <div className="plan-card-body">
                    <span className="eyebrow">
                      {p.stops.length} STOPS · {criteria.vibe.toUpperCase()}
                    </span>
                    <h3>{p.title}</h3>
                    <p>{p.explanation}</p>
                    <div className="card-stats">
                      <span>${p.cost} est.</span>
                      <span>{p.duration} min</span>
                      <span>
                        {p.legs.some((l) => l.mode === "bus")
                          ? "Walk + bus"
                          : "Walking"}
                      </span>
                    </div>
                    <small>{p.suitability} · Hours may be unverified</small>
                    <div className="choose">
                      {selected?.id === p.id
                        ? "Your selected date"
                        : "Explore this date"}
                      <ArrowRight size={17} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
        {selected && (
          <div className="action-bar">
            <a className="secondary" href="#planner">
              Edit preferences ↑
            </a>
            <button className="secondary" disabled={!!busy} onClick={generate}>
              <RefreshCw size={16} />
              Regenerate
            </button>
          </div>
        )}
        {selected && (
          <Itinerary
            plan={selected}
            onSwap={swap}
            onSave={saved ? undefined : save}
            busy={!!busy}
            savedUrl={saved?.url}
            shareId={saved?.shareId}
            photon={photon}
            canPair
          />
        )}
        {saved && (
          <p className="saved-note" role="status">
            Your date is saved.{" "}
            <a href={saved.url}>Open read-only share page ↗</a> ·{" "}
            <a href={"/edit/" + saved.shareId}>Creator editing page ↗</a>
          </p>
        )}
        {!result && (
          <section id="how" className="how">
            <div>
              <span>01</span>
              <h3>Tell us your vibe.</h3>
              <p>Your time, your budget, your kind of day.</p>
            </div>
            <div>
              <span>02</span>
              <h3>Find your little adventure.</h3>
              <p>Thoughtful stops with a plan between them.</p>
            </div>
            <div>
              <span>03</span>
              <h3>Go make a memory.</h3>
              <p>Save the plan. Share it with your person.</p>
            </div>
          </section>
        )}
      </main>
      <footer>
        <Link className="logo" href="/">
          <Navigation size={19} />
          navidate
        </Link>
        <span>Made with a little love in Ithaca.</span>
        <small>BigRed//Hacks · 2026</small>
      </footer>
    </>
  );
}
