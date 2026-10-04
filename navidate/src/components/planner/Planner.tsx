"use client";
import Link from "next/link";
import { Button } from "react-aria-components";
import { DateField, StartTimeField, SelectField } from "@/components/ui/Fields";
import SiteHeader from "@/components/brand/SiteHeader";
import NaviMascot from "@/components/brand/NaviMascot";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  MapPin,
  Footprints,
  Bus,
  Clock,
  Wallet,
  Sparkles,
  LocateFixed,
  RefreshCw,
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
const pills = [
  {
    label: "Cozy coffee",
    text: "A cozy coffee date near Cornell",
    icon: "/navidate/icons/category_icons/09_cozy.png",
  },
  {
    label: "Surprise me ✨",
    text: "Surprise me with a lovely date in Ithaca",
    icon: "/navidate/icons/category_icons/10_surprise_me.png",
  },
  {
    label: "Something outdoors",
    text: "Something outdoors, not too much walking",
    icon: "/navidate/icons/category_icons/02_outdoors.png",
  },
  {
    label: "Romantic",
    text: "A romantic evening around Cornell and Ithaca",
    icon: "/navidate/icons/category_icons/07_romantic.png",
  },
] as const;
const planningCopy = [
  "Finding date ideas…",
  "Checking places…",
  "Building your route…",
  "Almost ready 💘",
];
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
    [seed, setSeed] = useState(0),
    [saved, setSaved] = useState<{ url: string; shareId: string } | null>(null),
    [text, setText] = useState(""),
    [hint, setHint] = useState(""),
    [dirty, setDirty] = useState(false),
    [locating, setLocating] = useState(false),
    [locationNotice, setLocationNotice] = useState(""),
    [voiceOpen, setVoiceOpen] = useState(false),
    [planningMessage, setPlanningMessage] = useState(planningCopy[0]);
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
  useEffect(() => {
    if (busy !== "plan") return;
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % planningCopy.length;
      setPlanningMessage(planningCopy[i]);
    }, 1600);
    return () => clearInterval(id);
  }, [busy]);
  function update<K extends keyof Criteria>(key: K, value: Criteria[K]) {
    setCriteria((c) => ({
      ...c,
      [key]: value,
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
    setPlanningMessage(planningCopy[0]);
    setError("");
    try {
      const r = await request("/api/plan", { criteria: input, seed });
      setResult(r);
      setDirty(true);
      setSelected(r.plans[0] ?? null);
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
  async function interpret(prompt = text) {
    const value = prompt.trim();
    if (!value) return;
    setText(value);
    if (!ai) {
      update("preferences", value);
      setHint(
        "Preferences noted. Review the form, then find your date.",
      );
      return;
    }
    setBusy("interpret");
    setError("");
    try {
      const d = await request("/api/interpret", {
        text: value,
        existing: criteria,
      });
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
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="hero-stage">
            <div className="hero-mascot-wrap">
              {/* User-supplied transparent primary Navi artwork. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="hero-navi-main"
                src="/navidate/pixel-mascots/12_waving.png"
                alt="Navi, the NaviDate cupid companion"
              />
            </div>
            <div className="hero-copy">
              <h1 className="hero-title">
                Navigate your next date,
                <span className="hero-script">for more butterflies</span>
              </h1>
              <p>
                Tell Navi what you&apos;re dreaming of, and we&apos;ll turn it into
                a date worth looking forward to.
              </p>
            </div>
            {/* Generated from the supplied layout reference; decorative only. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="hero-collage"
              src="/navidate/hero/date-collage.png"
              alt=""
            />
            <span className="hero-note" aria-hidden="true">
              fall in love<br />with the plan ♡
            </span>
          </div>
          <form
            className="prompt-bar"
            onSubmit={(e) => {
              e.preventDefault();
              void interpret();
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="prompt-icon prompt-icon-image"
              src="/navidate/icons/map_and_status_icons/16_sparkles_small.png"
              alt=""
            />
            <label className="sr-only" htmlFor="natural">
              Describe your ideal date
            </label>
            <input
              id="natural"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
              placeholder="Tell me what kind of date you’re in the mood for..."
            />
            <Button
              className="mic-button"
              type="button"
              aria-label="Talk to Navi"
              isDisabled={!!busy || locating}
              onPress={() => setVoiceOpen(true)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="control-icon-image mic-icon-image"
                src="/navidate/icons/utility_icons/11_voice_active.png"
                alt=""
              />
            </Button>
          </form>
          <div className="suggestion-pills">
            {pills.map((pill) => (
              <Button
                key={pill.label}
                type="button"
                className="pill"
                isDisabled={!!busy}
                onPress={() => {
                  setText(pill.text);
                  if (ai) void interpret(pill.text);
                  else setHint("Preferences noted in the prompt. Review the form, then find your date.");
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="chip-icon-image" src={pill.icon} alt="" />
                {pill.label}
              </Button>
            ))}
          </div>
        </section>
        <NaviVoice
          criteria={criteria}
          enabled={ai}
          disabled={!!busy || locating}
          open={voiceOpen}
          onOpenChange={setVoiceOpen}
          onReady={(next) => {
            setCriteria(next);
            setHint(
              "Navi filled in your details. Review the form, then find your date.",
            );
          }}
        />
        <section id="planner" className="planner-section">
          {busy === "resume" && (
            <p role="status" className="notice">
              Checking for your saved date…
            </p>
          )}
          {busy === "plan" && (
            <div className="planning-status" role="status">
              <NaviMascot state="thinking" size={88} />
              <p>{planningMessage}</p>
            </div>
          )}
          <div className="planner-layout">
            <div className="form-card">
              <h2>Date details</h2>
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
                        onPress={() =>
                          document
                            .getElementById("start-map")
                            ?.scrollIntoView({
                              behavior: window.matchMedia(
                                "(prefers-reduced-motion: reduce)",
                              ).matches
                                ? "instant"
                                : "smooth",
                            })
                        }
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
                    options={[60, 90, 120, 180, 240, 360, 480].map((n) => ({
                      id: String(n),
                      name: n < 120 ? `${n} minutes` : `${n / 60} hours`,
                    }))}
                    onChange={(value) => update("duration", Number(value))}
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
                        onChange={(e) =>
                          update("budget", Number(e.target.value))
                        }
                      />
                    </div>
                  </label>
                </div>
                <div className="preference-grid">
                  <fieldset className="vibes date-types">
                    <legend>Date idea</legend>
                    <div>
                    {(
                      [
                        ["any", "Surprise me", "/navidate/icons/category_icons/10_surprise_me.png"],
                        ["food", "Food", "/navidate/icons/category_icons/01_food_drinks.png"],
                        ["coffee", "Coffee", "/navidate/icons/category_icons/09_cozy.png"],
                        ["dessert", "Something sweet", "/navidate/icons/category_icons/07_romantic.png"],
                        ["outdoors", "Outdoors", "/navidate/icons/category_icons/02_outdoors.png"],
                      ] as const
                    ).map(([value, label, icon]) => (
                      <Button
                        key={value}
                        type="button"
                        aria-pressed={criteria.dateType === value}
                        className={criteria.dateType === value ? "active" : ""}
                        onPress={() => update("dateType", value)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="chip-icon-image" src={icon} alt="" />
                        {label}
                      </Button>
                    ))}
                    </div>
                  </fieldset>
                  <fieldset className="vibes mood-types">
                    <legend>Mood</legend>
                    <div>
                      {(
                        [
                          "Cozy",
                          "Romantic",
                          "Adventurous",
                          "Casual",
                          "Creative",
                        ] as const
                      ).map((v) => (
                        <Button
                          type="button"
                          className={criteria.vibe === v ? "active" : ""}
                          key={v}
                          aria-pressed={criteria.vibe === v}
                          onPress={() => update("vibe", v)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            className="chip-icon-image"
                            src={
                              v === "Cozy"
                                ? "/navidate/icons/category_icons/09_cozy.png"
                                : v === "Romantic"
                                  ? "/navidate/icons/category_icons/07_romantic.png"
                                  : v === "Adventurous"
                                    ? "/navidate/icons/category_icons/06_active.png"
                                    : v === "Casual"
                                      ? "/navidate/icons/category_icons/13_nature.png"
                                      : "/navidate/icons/category_icons/03_arts_culture.png"
                            }
                            alt=""
                          />
                          {v}
                        </Button>
                      ))}
                    </div>
                  </fieldset>
                </div>
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
                <div className="form-grid extra-prefs">
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
                    Additional preferences <small>Optional</small>
                  </span>
                  <textarea
                    maxLength={1000}
                    value={criteria.preferences}
                    onChange={(e) => update("preferences", e.target.value)}
                    placeholder="A quiet corner, a sweet treat, something unexpected…"
                  />
                </label>
                <div className="form-footer">
                  <Button type="submit" className="primary" isDisabled={!!busy}>
                    {busy === "plan" ? planningMessage : "Find my date"}
                    {busy === "plan" ? (
                      <RefreshCw className="spin" size={18} />
                    ) : (
                      <>
                        <Sparkles size={16} />
                        <ArrowRight size={18} />
                      </>
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
            <div className="start-map-card" id="start-map">
              <h2>Starting point</h2>
              <div className="map-card">
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
              </div>
              <p className="small muted">
                Custom starting points are hidden from public share views.
              </p>
            </div>
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
              {!result.plans.length && (
                <h2>Let’s try another direction.</h2>
              )}
              {selected && <p>{selected.explanation}</p>}
            </div>
            {result.error && <div className="notice">{result.error}</div>}
            {result.notices.map((n) => (
              <p className="notice" key={n}>
                {n}
              </p>
            ))}
            {result.plans.length > 0 && (
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
                    <div className="plan-card-body">
                      <span className="eyebrow">
                        {p.stops.length} STOPS · {criteria.vibe.toUpperCase()}
                      </span>
                      <h3>{p.title}</h3>
                      <p>{p.explanation}</p>
                      <div className="card-stats">
                        <span>${p.cost} est.</span>
                        <span>{p.duration} min</span>
                      </div>
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
            )}
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
              saved ? (error ? "Retry save" : "Save changes") : "Save & Share"
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
          NaviDate
        </Link>
        <span>Made with a little love in Ithaca.</span>
        <small>BigRed//Hacks · 2026</small>
      </footer>
    </>
  );
}
