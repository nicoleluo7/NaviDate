"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { Mic, Square } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import type { Criteria } from "@/types";
import { resolveRequirements } from "@/lib/voice/requirements";

type Turn = { who: "You" | "Navi"; text: string };
export default function NaviVoice({
  criteria,
  enabled,
  disabled,
  onReady,
}: {
  criteria: Criteria;
  enabled: boolean;
  disabled: boolean;
  onReady: (c: Criteria) => void;
}) {
  const [state, setState] = useState<"idle" | "connecting" | "listening">(
      "idle",
    ),
    [notice, setNotice] = useState(""),
    [turns, setTurns] = useState<Turn[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const avatar = useRef<HTMLDivElement>(null),
    transcript = useRef<HTMLDivElement>(null);
  const analyser = useRef<AnalyserNode | null>(null),
    frame = useRef<number>(0);
  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [turns]);
  function visualize() {
    if (!analyser.current || !players.current.length) return;
    const data = new Float32Array(analyser.current.fftSize);
    analyser.current.getFloatTimeDomainData(data);
    const level = Math.min(
      1,
      Math.sqrt(data.reduce((n, v) => n + v * v, 0) / data.length) * 5,
    );
    avatar.current?.style.setProperty("--voice-level", String(level));
    frame.current = requestAnimationFrame(visualize);
  }
  const connection = useRef<WebSocket | null>(null),
    stream = useRef<MediaStream | null>(null),
    context = useRef<AudioContext | null>(null),
    worklet = useRef<AudioWorkletNode | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    generation = useRef(0),
    players = useRef<AudioBufferSourceNode[]>([]),
    nextTime = useRef(0),
    current = useRef(criteria),
    ready = useRef(onReady);
  useEffect(() => {
    current.current = criteria;
    ready.current = onReady;
  }, [criteria, onReady]);
  function cleanup() {
    generation.current++;
    cancelAnimationFrame(frame.current);
    analyser.current?.disconnect();
    analyser.current = null;
    avatar.current?.style.setProperty("--voice-level", "0");
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    connection.current?.close();
    connection.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    worklet.current?.disconnect();
    worklet.current = null;
    players.current.forEach((p) => {
      try {
        p.stop();
      } catch {}
    });
    players.current = [];
    nextTime.current = 0;
    void context.current?.close();
    context.current = null;
  }
  useEffect(() => () => cleanup(), []);
  function stop(message = "Conversation ended. Your form is still here.") {
    cleanup();
    setSpeaking(false);
    setState("idle");
    setNotice(message);
  }
  async function start() {
    cleanup();
    setSpeaking(false);
    const run = generation.current;
    const conversationStart = current.current.start;
    setState("connecting");
    setNotice("Connecting to Navi…");
    setTurns([]);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Voice needs HTTPS or localhost and microphone access. Use the form on this connection.",
        );
      const audio = new AudioContext({ sampleRate: 24000 });
      context.current = audio;
      if (audio.sampleRate !== 24000)
        throw new Error(
          "This browser cannot use Navi’s audio format. Try a different browser or use the form.",
        );
      await audio.resume();
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
      if (generation.current !== run) {
        mic.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = mic;
      analyser.current = audio.createAnalyser();
      analyser.current.fftSize = 256;
      analyser.current.connect(audio.destination);
      const r = await fetch("/api/voice/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria: current.current }),
      });
      const data = await r.json();
      if (generation.current !== run) return;
      if (!r.ok) throw new Error(data.error ?? "Navi is unavailable.");
      await audio.audioWorklet.addModule("/navi-audio-worklet.js");
      if (generation.current !== run) return;
      const socket = new WebSocket(
        `wss://api.x.ai/v1/realtime?model=${encodeURIComponent(data.model)}`,
        [`xai-client-secret.${data.token}`],
      );
      connection.current = socket;
      const node = new AudioWorkletNode(audio, "navi-pcm");
      worklet.current = node;
      audio.createMediaStreamSource(mic).connect(node);
      const mute = audio.createGain();
      mute.gain.value = 0;
      node.connect(mute).connect(audio.destination);
      let configured = false,
        submitted = false,
        discardAudio = false;
      const seen = new Set<string>();
      const send = (value: unknown) => {
        if (socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify(value));
      };
      node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (
          !configured ||
          socket.readyState !== WebSocket.OPEN ||
          socket.bufferedAmount > 200000
        )
          return;
        const bytes = new Uint8Array(event.data);
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        send({ type: "input_audio_buffer.append", audio: btoa(binary) });
      };
      socket.onopen = () => {
        send({ type: "session.update", session: data.config });
      };
      socket.onerror = () => {
        if (generation.current === run)
          stop("Navi’s connection failed. Try again or use the form.");
      };
      socket.onclose = () => {
        if (generation.current === run)
          stop(
            "Navi disconnected. Your form and conversation text are still here.",
          );
      };
      timer.current = setTimeout(() => {
        if (generation.current === run)
          stop(
            "Voice session ended after three minutes. Start again or finish in the form.",
          );
      }, data.maxSessionSeconds * 1000);
      socket.onmessage = (event) => {
        if (generation.current !== run) return;
        try {
          const e = JSON.parse(event.data);
          if (e.type === "session.updated" && !configured) {
            configured = true;
            setState("listening");
            setNotice(
              "Navi is listening. You can interrupt or stop at any time.",
            );
            send({ type: "response.create" });
          }
          if (e.type === "response.created") discardAudio = false;
          if (e.type === "error")
            throw new Error(
              "Navi couldn’t complete this conversation. Try again or use the form.",
            );
          if (e.type === "input_audio_buffer.speech_started") {
            discardAudio = true;
            setSpeaking(false);
            cancelAnimationFrame(frame.current);
            avatar.current?.style.setProperty("--voice-level", "0");
            players.current.forEach((p) => {
              try {
                p.stop();
              } catch {}
            });
            players.current = [];
            nextTime.current = audio.currentTime;
          }
          if (
            ["response.output_audio.delta", "response.audio.delta"].includes(
              e.type,
            ) &&
            typeof e.delta === "string" &&
            !discardAudio
          ) {
            const binary = atob(e.delta),
              bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
            const pcm = new DataView(bytes.buffer),
              buffer = audio.createBuffer(
                1,
                Math.floor(bytes.length / 2),
                24000,
              ),
              channel = buffer.getChannelData(0);
            for (let i = 0; i < channel.length; i++)
              channel[i] = pcm.getInt16(i * 2, true) / 32768;
            const source = audio.createBufferSource();
            source.buffer = buffer;
            source.connect(analyser.current!);
            source.start(Math.max(audio.currentTime, nextTime.current));
            nextTime.current =
              Math.max(audio.currentTime, nextTime.current) + buffer.duration;
            players.current.push(source);
            setSpeaking(true);
            cancelAnimationFrame(frame.current);
            visualize();
            source.onended = () => {
              players.current = players.current.filter((p) => p !== source);
              source.disconnect();
              if (generation.current === run && !players.current.length) {
                setSpeaking(false);
                cancelAnimationFrame(frame.current);
                avatar.current?.style.setProperty("--voice-level", "0");
              }
            };
          }
          if (
            [
              "conversation.item.input_audio_transcription.completed",
              "response.output_audio_transcript.done",
              "response.audio_transcript.done",
            ].includes(e.type) &&
            typeof e.transcript === "string"
          ) {
            setTurns((t) =>
              [
                ...t,
                {
                  who: e.type.startsWith("conversation")
                    ? ("You" as const)
                    : ("Navi" as const),
                  text: e.transcript.slice(0, 1500),
                },
              ].slice(-24),
            );
          }
          if (
            e.type === "response.function_call_arguments.done" &&
            !seen.has(e.call_id) &&
            !submitted
          ) {
            seen.add(e.call_id);
            try {
              if (e.name !== "submit_requirements")
                throw new Error(
                  "Unknown action. Ask for date requirements only.",
                );
              const next = resolveRequirements(
                JSON.parse(e.arguments),
                conversationStart,
              );
              submitted = true;
              send({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: e.call_id,
                  output: JSON.stringify({
                    status: "accepted",
                    next: "Navi is checking nearby places and routes.",
                  }),
                },
              });
              stop(
                "Got it. Navi is finding date options from your confirmed preferences.",
              );
              ready.current(next);
            } catch (err) {
              send({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: e.call_id,
                  output: JSON.stringify({
                    error:
                      err instanceof Error
                        ? err.message
                        : "Ask for the missing details.",
                  }),
                },
              });
              send({ type: "response.create" });
            }
          }
        } catch (err) {
          stop(
            err instanceof Error
              ? err.message
              : "Navi could not complete the conversation.",
          );
        }
      };
    } catch (err) {
      if (generation.current === run)
        stop(
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Microphone permission was denied. Allow it in browser settings or use the form."
            : err instanceof Error
              ? err.message
              : "Voice unavailable. Use the form.",
        );
    }
  }
  return (
    <section className="navi-voice" aria-label="Talk to Navi">
      <div className="navi-heading">
        <div
          ref={avatar}
          className="navi-avatar"
          data-speaking={speaking}
          aria-label={speaking ? "Navi is speaking" : "Navi"}
        >
          <BrandMark size={64} />
        </div>
        <div>
          <span className="navi-eyebrow">YOUR DATE-PLANNING COMPANION</span>
          <h3>Talk it through</h3>
          <p>Navi can fill in the form from a short conversation.</p>
        </div>
      </div>
      <Button
        className={state === "idle" ? "primary" : "secondary"}
        isDisabled={state === "idle" && (!enabled || disabled)}
        onPress={() => (state === "idle" ? void start() : stop())}
      >
        {state === "idle" ? <Mic size={18} /> : <Square size={16} />}{" "}
        {state === "idle"
          ? "Talk to Navi"
          : state === "connecting"
            ? "Cancel connection"
            : "End conversation"}
      </Button>
      <p className="small muted">
        {enabled
          ? "Tap to start. The microphone stops when you end the chat."
          : "Voice is unavailable. You can plan with the form below."}
      </p>
      {state !== "idle" && (
        <p className="navi-live-state" role="status">
          <span className="navi-live-dot" />
          {state === "connecting"
            ? "Getting ready…"
            : speaking
              ? "Navi is speaking · you can interrupt"
              : "Listening to you…"}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!!turns.length && (
        <div
          ref={transcript}
          className="voice-transcript"
          role="log"
          aria-label="Conversation with Navi"
        >
          {turns.map((t, i) => (
            <div
              key={i}
              className={`voice-turn ${t.who === "You" ? "from-you" : "from-navi"}`}
            >
              {t.who === "Navi" && <BrandMark size={24} />}
              <div>
                <span className="voice-speaker">{t.who}</span>
                <p>{t.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
