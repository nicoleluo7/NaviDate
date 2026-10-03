"use client";
import Link from "next/link";
import { Button } from "react-aria-components";
import { DateField, StartTimeField, SelectField } from "@/components/ui/Fields";
import BrandMark from "@/components/BrandMark";
import { useEffect, useState } from "react";
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
  Utensils,
  Sparkles,
  ChevronDown,
  LocateFixed,
  RefreshCw,
  Coffee,
  Palette,
  Trees,
} from "lucide-react";
import RestaurantBrowser from "./RestaurantBrowser";
import NaviVoice from "@/components/voice/NaviVoice";
import { locationFromPosition, locationError } from "@/lib/location";
import { pointSchema } from "@/types";
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
  dateType: "any",
  vibe: "Cozy",
  transport: "walk",
  dietary: [],
  setting: "any",
  maxWalkKm: 5,
  returnToStart: false,
  preferences: "",
};
export default function Planner({
  photon = false,
  ai = false,
}: {
  photon?: boolean;
  ai?: boolean;
}) {
  const [criteria, setCriteria] = useState<Criteria>(initial),
    [result, setResult] = useState<(PlanResult & { draftId: string }) | null>(
      null,
    ),
    [selected, setSelected] = useState<Plan | null>(null),
    [busy, setBusy] = useState("resume"),
    [error, setError] = useState(""),
    [mapPicker, setMapPicker] = useState(false),
    [seed, setSeed] = useState(0),
    [saved, setSaved] = useState<{ url: string; shareId: string } | null>(null),
    [text, setText] = useState(""),
    [hint, setHint] = useState(""),
    [dirty, setDirty] = useState(false),
    [locating, setLocating] = useState(false),
    [locationNotice, setLocationNotice] = useState("");
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    let active = true;
    (query.has("new")
      ? Promise.resolve({ saved: null })
      : request("/api/resume", { shareId: query.get("date") ?? undefined })
    )
      .then((d) => {
        if (!active || !d.saved) return;
        setCriteria(d.criteria);
        setResult({
          plans: [d.plan],
          draftId: d.draftId,
          notices: [],
          ai: false,
        });
        setSelected(d.plan);
        setSaved({ ...d.saved, url: location.origin + d.saved.url });
        setDirty(false);
        setHint(
          "Your saved date is ready to edit. Changes keep the same share link.",
        );
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy("");
      });
    return () => {
      active = false;
    };
  }, []);
  function update<K extends keyof Criteria>(key: K, value: Criteria[K]) {
    setCriteria((c) => ({
      ...c,
      [key]: value,
      unrestricted: c.unrestricted?.filter(
        (flag) => flag !== (key === "maxWalkKm" ? "distance" : key),
      ),
      ...(key === "dateType" && value !== "food"
        ? { restaurantId: undefined }
        : {}),
    }));
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
  async function generate(input: Criteria = criteria) {
    setBusy("plan");
    setError("");
    try {
      const r = await request("/api/plan", { criteria: input, seed });
      setResult(r);
      setDirty(true);
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
        shareId: saved?.shareId,
      });
      setSaved({ url: location.origin + d.url, shareId: d.shareId });
      setDirty(false);
      history.replaceState(null, "", "/?date=" + d.shareId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy("");
    }
  }
  async function swap(index: number) {
    if (!selected || !result) return;
    const shareId = saved?.shareId;
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
      setDirty(true);
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
      if (!shareId) return;
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
        setDirty(false);
      } catch {
        throw new Error(
          "Your change is ready, but could not be saved. Choose Retry save to update the same share link.",
        );
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
      const d = await request("/api/interpret", { text, existing: criteria });
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
    if (!window.isSecureContext) {
      setLocationNotice(
        "Location needs HTTPS or localhost. On a phone using an HTTP network address, choose a landmark or a point on the map.",
      );
      return;
    }
    if (!navigator.geolocation) {
      setLocationNotice("Location isn’t supported. Choose a landmark instead.");
      return;
    }
    setLocating(true);
    setLocationNotice("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        try {
          update("start", locationFromPosition(position));
          setLocationNotice(
            "Current location selected. It stays hidden on your public share page.",
          );
        } catch (e) {
          setLocationNotice(
            e instanceof Error ? e.message : "Choose a landmark instead.",
          );
        }
      },
      (error) => {
        setLocating(false);
        setLocationNotice(locationError(error.code));
      },
      { timeout: 15000, maximumAge: 60000, enableHighAccuracy: true },
    );
  }
  return (
    <>
      <header className="site-header">
        <Link className="logo" href="/">
          <BrandMark size={34} />
          navidate
        </Link>
        <nav>
          <a href="#how">How it works</a>
          <a className="nav-cta" href="#planner">
            Plan a date <ArrowUpRight size={16} />
          </a>
        </nav>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="location-tag">
              <span /> CORNELL & ITHACA, NY
            </div>
            <h1>
              <em>Navigate</em> your
              <br />
              next <em>date.</em>
            </h1>
            <p>
              Turn “What should we do?” into a date. <br />A few favorites, a
              little adventure, and a plan
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
            <svg className="art-route" viewBox="0 0 460 390" aria-hidden="true">
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
        <section id="planner" className="planner-section">
          <div className="section-intro">
            <span className="eyebrow">LET’S MAKE A LITTLE PLAN</span>
            <h2>What’s your kind of date?</h2>
            <p>
              You bring the company. We’ll help with the where, when, and how.
            </p>
          </div>
          <div className="form-card">
            <NaviVoice
              criteria={criteria}
              enabled={ai}
              disabled={!!busy || locating}
              onReady={(next) => {
                setCriteria(next);
                void generate(next);
              }}
            />
            {busy === "resume" && (
              <p role="status" className="notice">
                Checking for your saved date…
              </p>
            )}
            <form
              inert={busy === "resume"}
              onSubmit={(e) => {
                e.preventDefault();
                void generate();
              }}
            >
              <div className="form-grid">
                <div className="wide">
                  <SelectField
                    label="Where are we starting?"
                    icon={<MapPin size={16} />}
                    value={criteria.start.id ?? "custom"}
                    options={[
                      ...landmarks.map((l) => ({ id: l.id, name: l.name })),
                      ...(!criteria.start.id
                        ? [{ id: "custom", name: criteria.start.name }]
                        : []),
                    ]}
                    onChange={(id) => {
                      const landmark = landmarks.find((l) => l.id === id);
                      if (landmark) update("start", landmark);
                    }}
                  />
                  <div className="location-actions">
                    <Button
                      type="button"
                      onPress={() => setMapPicker((m) => !m)}
                    >
                      Choose on map
                    </Button>
                    <Button
                      type="button"
                      onPress={locate}
                      isDisabled={locating}
                      aria-describedby="location-status"
                    >
                      <LocateFixed size={13} />
                      {locating ? "Locating…" : "Use my location"}
                    </Button>
                  </div>
                  <p id="location-status" role="status" className="small muted">
                    {locationNotice}
                  </p>
                </div>
                <DateField
                  value={criteria.date}
                  onChange={(value) => update("date", value)}
                />
                <StartTimeField
                  value={criteria.time}
                  onChange={(value) => update("time", value)}
                />
                <SelectField
                  className="duration-field"
                  label="Time together"
                  icon={<Clock size={16} />}
                  value={String(criteria.duration)}
                  onChange={(value) => update("duration", Number(value))}
                  options={[60, 90, 120, 180, 240, 360, 480].map((n) => ({
                    id: String(n),
                    name: n < 120 ? `${n} minutes` : `${n / 60} hours`,
                  }))}
                />
                <label className="budget-field">
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
                      if (!pointSchema.safeParse(p).success) {
                        setLocationNotice(
                          "Choose a point within Cornell or Ithaca.",
                        );
                        return;
                      }
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
                          : "Point selected. We’ll check walking routes from here.",
                      );
                    }}
                  />
                  <p className="small muted">
                    Custom starting points are hidden from public share views.
                  </p>
                </div>
              )}
              <fieldset className="vibes date-types">
                <legend>What kind of date?</legend>
                <p className="field-help">
                  Choose your main activity. We’ll find a little something to go
                  with it.
                </p>
                <div>
                  {(
                    [
                      ["any", "Surprise me", Sparkles],
                      ["food", "Food", Utensils],
                      ["coffee", "Coffee", Coffee],
                      ["dessert", "Something sweet", Heart],
                      ["outdoors", "Outdoors", Trees],
                    ] as const
                  ).map(([value, label, Icon]) => (
                    <Button
                      key={value}
                      type="button"
                      aria-pressed={criteria.dateType === value}
                      className={criteria.dateType === value ? "active" : ""}
                      onPress={() => update("dateType", value)}
                    >
                      <Icon size={18} />
                      {label}
                    </Button>
                  ))}
                </div>
              </fieldset>
              {criteria.dateType === "food" && (
                <RestaurantBrowser
                  key={`${criteria.start.lat},${criteria.start.lng}`}
                  criteria={criteria}
                  disabled={!!busy}
                  onChoose={(restaurantId) =>
                    setCriteria((c) => ({ ...c, restaurantId }))
                  }
                />
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
                    <Button
                      type="button"
                      className={criteria.vibe === v ? "active" : ""}
                      key={v}
                      aria-pressed={criteria.vibe === v}
                      onPress={() => update("vibe", v)}
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
                    </Button>
                  ))}
                </div>
              </fieldset>
              <div className="transport-row">
                <span>Getting around</span>
                <div>
                  {(["walk", "bus"] as const).map((t) => (
                    <Button
                      type="button"
                      key={t}
                      className={criteria.transport === t ? "active" : ""}
                      aria-pressed={criteria.transport === t}
                      onPress={() => update("transport", t)}
                    >
                      {t === "walk" ? (
                        <Footprints size={17} />
                      ) : (
                        <Bus size={17} />
                      )}{" "}
                      {t === "walk" ? "Walking" : "Walking + bus"}
                    </Button>
                  ))}
                </div>
              </div>
              <details className="preferences">
                <summary>
                  A few more preferences <ChevronDown size={17} />
                </summary>
                {ai && (
                  <div className="ai-input">
                    <label htmlFor="natural">
                      Or describe it in a sentence
                    </label>
                    <div>
                      <input
                        id="natural"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        maxLength={1000}
                        placeholder="A cozy afternoon near Cornell, under $50…"
                      />
                      <Button
                        className="secondary"
                        type="button"
                        isDisabled={!!busy || !text}
                        onPress={interpret}
                      >
                        <Sparkles size={16} />
                        Fill my preferences
                      </Button>
                    </div>
                  </div>
                )}
                <div className="form-grid">
                  <SelectField
                    label="Indoor or outdoor?"
                    value={criteria.setting}
                    onChange={(value) =>
                      update("setting", value as Criteria["setting"])
                    }
                    options={[
                      { id: "any", name: "A little of either" },
                      { id: "indoor", name: "Indoor activities" },
                      { id: "outdoor", name: "Outdoor activities" },
                    ]}
                  />
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
                <Button type="submit" className="primary" isDisabled={!!busy}>
                  {busy === "plan"
                    ? "Finding places and checking your date…"
                    : "Find our date"}
                  {busy === "plan" ? (
                    <RefreshCw className="spin" size={18} />
                  ) : (
                    <ArrowRight size={18} />
                  )}
                </Button>
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
                {saved && !dirty
                  ? "Your saved itinerary, ready to revisit or adjust."
                  : result.ai
                    ? "Chosen by Gemini from nearby places, with routes and schedules checked."
                    : result.plans.length
                      ? "Local suggestions from our curated places."
                      : "Your preferences are still here. Adjust them or try again."}
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
                <Button
                  className={`plan-card ${selected?.id === p.id ? "chosen" : ""}`}
                  key={`${i}-${p.id}`}
                  isDisabled={!!busy}
                  aria-pressed={selected?.id === p.id}
                  onPress={() => {
                    setSelected(p);
                    setDirty(true);
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
                    <p className="card-weather">{p.weather.summary}</p>
                    <small>{p.suitability} · Hours may be unverified</small>
                    <div className="choose">
                      {selected?.id === p.id
                        ? "Your selected date"
                        : "Explore this date"}
                      <ArrowRight size={17} />
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </section>
        )}
        {selected && (
          <div className="action-bar">
            <Button
              className="secondary"
              isDisabled={!!busy}
              onPress={() => {
                setCriteria(initial);
                setResult(null);
                setSelected(null);
                setSaved(null);
                setDirty(false);
                setError("");
                setHint("");
                history.replaceState(null, "", "/?new=1");
                document.getElementById("planner")?.scrollIntoView();
              }}
            >
              Plan a new date
            </Button>
            <a className="secondary" href="#planner">
              Edit preferences ↑
            </a>
            <Button
              className="secondary"
              isDisabled={!!busy}
              onPress={() => void generate()}
            >
              <RefreshCw size={16} />
              Regenerate
            </Button>
          </div>
        )}
        {selected && (
          <Itinerary
            plan={selected}
            onSwap={swap}
            onSave={!saved || dirty ? save : undefined}
            saveLabel={
              saved ? (error ? "Retry save" : "Save changes") : "Save this date"
            }
            saving={busy === "save"}
            dirty={dirty}
            busy={!!busy}
            savedUrl={saved?.url}
            shareId={saved?.shareId}
            photon={photon}
            canPair
          />
        )}
        {saved && (
          <p className="saved-note" role="status">
            {dirty
              ? "You have unsaved changes. The share page still shows your last saved version."
              : "Your date is saved. You can return here to edit it in this browser."}{" "}
            <a href={saved.url}>Open read-only share page ↗</a>
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
          <BrandMark size={26} />
          navidate
        </Link>
        <span>Made with a little love in Ithaca.</span>
        <small>BigRed//Hacks · 2026</small>
      </footer>
    </>
  );
}
