import { test, expect } from "@playwright/test";
test("Navi recovers from incomplete criteria, hands off once, and stops the microphone", async ({
  page,
}) => {
  await page.route("**/api/voice/session", (r) =>
    r.fulfill({
      json: {
        token: "fixture-ephemeral",
        model: "fixture",
        config: {},
        maxSessionSeconds: 180,
      },
    }),
  );
  let calls = 0;
  await page.route("**/api/plan", async (route) => {
    calls++;
    const { criteria } = route.request().postDataJSON();
    expect(criteria.budget).toBe(42);
    expect(criteria.time).toBe("14:30");
    expect(criteria.start.lat).toBeGreaterThan(42);
    await route.fulfill({
      json: {
        plans: [],
        notices: ["Mocked Gemini handoff"],
        ai: true,
        draftId: "fixture",
      },
    });
  });
  await page.addInitScript(() => {
    const w = window as unknown as {
      tracksStopped: number;
      WebSocket: unknown;
      AudioContext: unknown;
      AudioWorkletNode: unknown;
    };
    w.tracksStopped = 0;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [
            {
              stop: () => {
                w.tracksStopped++;
              },
            },
          ],
        }),
      },
    });
    const node = () => ({
      connect: () => node(),
      disconnect: () => {},
      port: { onmessage: null },
      gain: { value: 0 },
    });
    w.AudioWorkletNode = class {
      port = { onmessage: null };
      connect() {
        return node();
      }
      disconnect() {}
    };
    w.AudioContext = class {
      sampleRate = 24000;
      currentTime = 0;
      destination = {};
      audioWorklet = { addModule: async () => {} };
      resume() {
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
      createMediaStreamSource() {
        return node();
      }
      createAnalyser() {
        return {
          ...node(),
          fftSize: 256,
          getFloatTimeDomainData: (data: Float32Array) => data.fill(0.1),
        };
      }
      createBuffer(_channels: number, length: number, rate: number) {
        return {
          duration: length / rate,
          getChannelData: () => new Float32Array(length),
        };
      }
      createBufferSource() {
        return {
          ...node(),
          buffer: null,
          onended: null as (() => void) | null,
          start() {},
          stop() {
            this.onended?.();
          },
        };
      }
      createGain() {
        return node();
      }
    };
    const NativeWebSocket = window.WebSocket;
    class FakeSocket {
      static OPEN = 1;
      readyState = 1;
      bufferedAmount = 0;
      onopen: (() => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      step = 0;
      constructor() {
        setTimeout(() => this.onopen?.(), 10);
      }
      emit(e: unknown) {
        setTimeout(() => this.onmessage?.({ data: JSON.stringify(e) }), 10);
      }
      send(raw: string) {
        const e = JSON.parse(raw);
        if (e.type === "session.update") this.emit({ type: "session.updated" });
        if (e.type === "response.create") {
          this.step++;
          if (this.step === 1) {
            this.emit({
              type: "response.audio.delta",
              delta: btoa("\x00\x10".repeat(2400)),
            });
            this.emit({
              type: "response.audio_transcript.done",
              transcript: "Hi, I’m Navi. What kind of date sounds lovely?",
            });
            setTimeout(
              () =>
                this.emit({
                  type: "response.function_call_arguments.done",
                  call_id: "incomplete",
                  name: "submit_requirements",
                  arguments: JSON.stringify({ budget: 42, startId: "current" }),
                }),
              1000,
            );
          } else {
            const event = {
              type: "response.function_call_arguments.done",
              call_id: "complete",
              name: "submit_requirements",
              arguments: JSON.stringify({
                startId: "current",
                date: "2026-10-04",
                time: "14:30",
                duration: 120,
                budget: 42,
                vibe: "Cozy",
                transport: "walk",
              }),
            };
            this.emit(event);
            this.emit(event);
          }
        }
      }
      close() {
        this.readyState = 3;
      }
    }
    w.WebSocket = new Proxy(NativeWebSocket, {
      construct(target, args) {
        return String(args[0]).startsWith("wss://api.x.ai/")
          ? new FakeSocket()
          : Reflect.construct(target, args);
      },
    });
  });
  await page.goto("/?new=1");
  await expect(
    page.getByRole("button", { name: "Talk to Navi", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Talk to Navi", exact: true }).click();
  await expect(
    page.getByLabel("Navi is speaking", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Hi, I’m Navi. What kind of date sounds lovely?"),
  ).toBeVisible();
  await expect(
    page.getByText("Navi filled in your details. Review the form, then find your date."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Find my date", exact: true })
    .click();
  await expect(page.getByText("Mocked Gemini handoff")).toBeVisible();
  await expect(page.locator(".navi-avatar")).toHaveAttribute(
    "data-speaking",
    "false",
  );
  expect(calls).toBe(1);
  expect(
    await page.evaluate(
      () => (window as unknown as { tracksStopped: number }).tracksStopped,
    ),
  ).toBe(1);
});
test("denied microphone never requests a voice token", async ({ page }) => {
  let tokenCalls = 0;
  await page.route("**/api/voice/session", (r) => {
    tokenCalls++;
    return r.fulfill({
      status: 503,
      json: { error: "Unexpected token request" },
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: async () => {
          throw new DOMException("Denied", "NotAllowedError");
        },
      },
    });
  });
  await page.goto("/?new=1");
  await page.getByRole("button", { name: "Talk to Navi", exact: true }).click();
  await expect(
    page.getByText(/Microphone permission was denied/).first(),
  ).toBeVisible();
  expect(tokenCalls).toBe(0);
  await expect(
    page.getByRole("button", { name: "Find my date", exact: true }),
  ).toBeEnabled();
});
