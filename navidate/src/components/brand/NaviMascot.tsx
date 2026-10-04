export type NaviMood =
  | "idle"
  | "listening"
  | "thinking"
  | "talking"
  | "happy"
  | "exploring"
  | "photo"
  | "resting"
  | "puzzled";

export default function NaviMascot({
  state = "idle",
  size = 120,
}: {
  state?: NaviMood;
  size?: number;
}) {
  const source = {
    idle: "/navidate/pixel-mascots/12_waving.png",
    happy: "/navidate/pixel-mascots/03_excited_jump.png",
    listening: "/navidate/pixel-mascots/08_thinking.png",
    talking: "/navidate/pixel-mascots/03_excited_jump.png",
    thinking: "/navidate/pixel-mascots/05_with_map.png",
    exploring: "/navidate/pixel-mascots/13_resting.png",
    photo: "/navidate/pixel-mascots/11_with_flowers.png",
    resting: "/navidate/pixel-mascots/14_happy_small.png",
    puzzled: "/navidate/pixel-mascots/15_puzzled.png",
  }[state];
  return (
    <div
      className="navi-mascot"
      data-state={state}
      style={{ width: size, height: size }}
    >
      {/* User-supplied transparent Navi state asset. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="navi-state-image"
        src={source}
        alt=""
      />
    </div>
  );
}
