"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

type Butterfly = {
  id: number;
  x: number;
  y: number;
  drift: number;
  variant: "open" | "hearts" | "blush" | "side";
};

const butterflyTypes: Butterfly["variant"][] = [
  "open",
  "hearts",
  "blush",
  "side",
];

export default function PixelAmbience() {
  const [butterflies, setButterflies] = useState<Butterfly[]>([]);
  const nextId = useRef(0);
  const lastRelease = useRef(0);

  useEffect(() => {
    function spawn(x: number, y: number) {
      const id = nextId.current++;
      const arrivals: Butterfly[] = [
        {
          id,
          x: x - 22,
          y: y - 22,
          drift: id % 2 === 0 ? -42 : 42,
          variant: butterflyTypes[id % butterflyTypes.length],
        },
      ];
      setButterflies((current) => [...current.slice(-10), ...arrivals]);
      window.setTimeout(() => {
        const ids = new Set(arrivals.map(({ id }) => id));
        setButterflies((current) => current.filter(({ id }) => !ids.has(id)));
      }, 1800);
    }

    function release(event: PointerEvent) {
      if (event.button !== 0) return;
      lastRelease.current = performance.now();
      spawn(event.clientX, event.clientY);
    }

    function trail(event: PointerEvent) {
      if ((event.buttons & 1) === 0) return;
      const now = performance.now();
      if (now - lastRelease.current < 110) return;
      lastRelease.current = now;
      spawn(event.clientX, event.clientY);
    }

    window.addEventListener("pointerdown", release);
    window.addEventListener("pointermove", trail);
    return () => {
      window.removeEventListener("pointerdown", release);
      window.removeEventListener("pointermove", trail);
    };
  }, []);

  return (
    <div className="pixel-ambience" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="pixel-cloud pixel-cloud-one"
        src="/navidate/background/new/cloud-wide.png"
        alt=""
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="pixel-cloud pixel-cloud-two"
        src="/navidate/background/new/cloud-hearts.png"
        alt=""
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="pixel-cloud pixel-cloud-three"
        src="/navidate/background/new/cloud-wide.png"
        alt=""
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="pixel-heart pixel-heart-one"
        src="/navidate/background/new/heart-sparkle.png"
        alt=""
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="pixel-heart pixel-heart-two"
        src="/navidate/background/new/heart-soft.png"
        alt=""
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="pixel-heart pixel-heart-three"
        src="/navidate/background/new/heart-sparkle.png"
        alt=""
      />
      {butterflies.map((butterfly) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={butterfly.id}
          className={`click-butterfly click-butterfly-${butterfly.variant}`}
          src={`/navidate/background/new/butterfly-${butterfly.variant}.png`}
          alt=""
          style={
            {
              left: butterfly.x,
              top: butterfly.y,
              "--butterfly-drift": `${butterfly.drift}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
