"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

type ClickParticle = {
  id: number;
  x: number;
  y: number;
  drift: number;
  variant:
    "open" | "hearts" | "blush" | "side" | "heart-sparkle" | "heart-soft";
};

const particleTypes: ClickParticle["variant"][] = [
  "open",
  "heart-sparkle",
  "hearts",
  "heart-soft",
  "blush",
  "heart-sparkle",
  "side",
  "heart-soft",
];

export default function PixelAmbience() {
  const [particles, setParticles] = useState<ClickParticle[]>([]);
  const nextId = useRef(0);
  const lastRelease = useRef(0);

  useEffect(() => {
    function spawn(x: number, y: number) {
      const id = nextId.current++;
      const arrivals: ClickParticle[] = [
        {
          id,
          x: x - 22,
          y: y - 22,
          drift: id % 2 === 0 ? -42 : 42,
          variant: particleTypes[id % particleTypes.length],
        },
      ];
      setParticles((current) => [...current.slice(-10), ...arrivals]);
      window.setTimeout(() => {
        const ids = new Set(arrivals.map(({ id }) => id));
        setParticles((current) => current.filter(({ id }) => !ids.has(id)));
      }, 1800);
    }

    function release(event: PointerEvent) {
      if (event.button !== 0) return;
      lastRelease.current = performance.now();
      spawn(event.clientX, event.clientY);
    }

    function trail(event: PointerEvent) {
      if (event.pointerType === "touch") return;
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
        className="pixel-cloud pixel-cloud-four"
        src="/navidate/background/new/cloud-hearts.png"
        alt=""
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="pixel-cloud pixel-cloud-five"
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="pixel-heart pixel-heart-four"
        src="/navidate/background/new/heart-soft.png"
        alt=""
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="pixel-heart pixel-heart-five"
        src="/navidate/background/new/heart-sparkle.png"
        alt=""
      />
      {particles.map((particle) => {
        const isHeart = particle.variant.startsWith("heart-");
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={particle.id}
            className={`click-butterfly ${isHeart ? "click-particle-heart" : `click-butterfly-${particle.variant}`}`}
            src={`/navidate/background/new/${isHeart ? particle.variant : `butterfly-${particle.variant}`}.png`}
            alt=""
            style={
              {
                left: particle.x,
                top: particle.y,
                "--butterfly-drift": `${particle.drift}px`,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
