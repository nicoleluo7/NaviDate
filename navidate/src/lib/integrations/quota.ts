import { getStorage } from "@/lib/storage";
export async function claimDaily(
  provider: string,
  requested: string | undefined,
  fallback = 30,
) {
  const parsed = Number(requested ?? fallback),
    limit = Number.isFinite(parsed)
      ? Math.max(0, Math.min(100, Math.floor(parsed)))
      : fallback;
  const store = getStorage(),
    day = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < limit; i++)
    if (await store.claim(`provider-quota:${provider}:${day}:${i}`, true))
      return;
  throw new Error(
    `${provider} daily limit reached. Try again tomorrow or use the form in local mode.`,
  );
}
