import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
export interface Storage {
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T): Promise<void>;
  claim<T>(key: string, value: T): Promise<boolean>;
  remove(key: string): Promise<void>;
}
export class LocalStorage implements Storage {
  private db: Database.Database;
  constructor(path = process.env.LOCAL_DB_PATH ?? ".local/navidate.sqlite") {
    if (path !== ":memory:")
      mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
  }
  async get<T>(key: string) {
    const row = this.db
      .prepare("SELECT value FROM records WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : null;
  }
  async put<T>(key: string, value: T) {
    this.db
      .prepare(
        "INSERT INTO records VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, JSON.stringify(value));
  }
  async claim<T>(key: string, value: T) {
    return (
      this.db
        .prepare("INSERT OR IGNORE INTO records VALUES (?, ?)")
        .run(key, JSON.stringify(value)).changes === 1
    );
  }
  async remove(key: string) {
    this.db.prepare("DELETE FROM records WHERE key = ?").run(key);
  }
  close() {
    this.db.close();
  }
}
export class SupabaseStorage implements Storage {
  private db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  async get<T>(key: string) {
    const { data, error } = await this.db
      .from("navidate_records")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw new Error("Storage unavailable");
    return (data?.value as T) ?? null;
  }
  async put<T>(key: string, value: T) {
    const { error } = await this.db
      .from("navidate_records")
      .upsert({ key, value });
    if (error) throw new Error("Storage unavailable");
  }
  async claim<T>(key: string, value: T) {
    const { error } = await this.db
      .from("navidate_records")
      .insert({ key, value });
    if (error?.code === "23505") return false;
    if (error) throw new Error("Storage unavailable");
    return true;
  }
  async remove(key: string) {
    const { error } = await this.db
      .from("navidate_records")
      .delete()
      .eq("key", key);
    if (error) throw new Error("Storage unavailable");
  }
}
let storage: Storage;
export function getStorage() {
  return (storage ??=
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? new SupabaseStorage()
      : new LocalStorage());
}
