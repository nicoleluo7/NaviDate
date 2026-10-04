import { afterEach, expect, it, vi } from "vitest";
import { registerSharedUser, toE164 } from "../src/lib/messaging/photon";

const previous = {
  id: process.env.SPECTRUM_PROJECT_ID,
  secret: process.env.SPECTRUM_PROJECT_SECRET,
};

afterEach(() => {
  if (previous.id === undefined) delete process.env.SPECTRUM_PROJECT_ID;
  else process.env.SPECTRUM_PROJECT_ID = previous.id;
  if (previous.secret === undefined) delete process.env.SPECTRUM_PROJECT_SECRET;
  else process.env.SPECTRUM_PROJECT_SECRET = previous.secret;
});

it("normalizes the phone number someone uses with iMessage", () => {
  expect(toE164("(607) 255-0100")).toBe("+16072550100");
  expect(toE164("16072550100")).toBe("+16072550100");
  expect(toE164("+447911123456")).toBe("+447911123456");
  expect(toE164("123")).toBeNull();
});

it("registers a shared Photon user and returns the assigned line", async () => {
  process.env.SPECTRUM_PROJECT_ID = "project";
  process.env.SPECTRUM_PROJECT_SECRET = "secret";
  const fetchImpl = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          succeed: true,
          data: { assignedPhoneNumber: "+14155951440" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
  );
  await expect(registerSharedUser("+16072550100", fetchImpl)).resolves.toBe(
    "+14155951440",
  );
  const [url, init] = fetchImpl.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe("https://spectrum.photon.codes/projects/project/users/");
  expect(init.method).toBe("POST");
  expect(JSON.parse(String(init.body))).toEqual({
    type: "shared",
    phoneNumber: "+16072550100",
  });
  expect(
    (init.headers as Record<string, string>).Authorization,
  ).toBe(`Basic ${Buffer.from("project:secret").toString("base64")}`);
});

it("reports when the Photon project cannot add another phone", async () => {
  process.env.SPECTRUM_PROJECT_ID = "project";
  process.env.SPECTRUM_PROJECT_SECRET = "secret";
  const fetchImpl = vi.fn(
    async () =>
      new Response(JSON.stringify({ message: "maxSharedUsers exceeded" }), {
        status: 403,
      }),
  );
  await expect(registerSharedUser("+16072550100", fetchImpl)).rejects.toThrow(
    /can’t add another phone/,
  );
});
