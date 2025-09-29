export type SupabaseEnv = {
  url: string;
  anonKey: string;
};

export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

async function sbFetch<T>(env: SupabaseEnv, path: string, options: RequestInit & { searchParams?: Record<string, string> } = {}): Promise<T> {
  const headers: Record<string, string> = {
    "apikey": env.anonKey,
    "Authorization": `Bearer ${env.anonKey}`,
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  const url = new URL(path, env.url);
  if (options.searchParams) {
    for (const [k, v] of Object.entries(options.searchParams)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase error ${res.status}: ${text}`);
  }
  // Handle empty body responses gracefully
  const ct = res.headers.get("content-type") || "";
  const txt = await res.text().catch(() => "");
  if (!txt || !ct.includes("application/json")) {
    return undefined as unknown as T;
  }
  return JSON.parse(txt) as T;
}

export type DbChat = {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
};

export type DbMessage = {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

export async function fetchChats(env: SupabaseEnv): Promise<DbChat[]> {
  return sbFetch<DbChat[]>(env, "/rest/v1/chats", { searchParams: { select: "*", order: "updated_at.desc" } });
}

export async function fetchMessages(env: SupabaseEnv, chatId: string): Promise<DbMessage[]> {
  return sbFetch<DbMessage[]>(env, "/rest/v1/messages", { searchParams: { select: "*", chat_id: `eq.${chatId}`, order: "created_at.asc" } });
}

export async function createChat(env: SupabaseEnv, chat: Pick<DbChat, "id" | "title">): Promise<void> {
  await sbFetch(env, "/rest/v1/chats", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(chat) });
}

export async function upsertChatTitle(env: SupabaseEnv, id: string, title: string): Promise<void> {
  await sbFetch(env, "/rest/v1/chats", { method: "PATCH", body: JSON.stringify({ title }), searchParams: { id: `eq.${id}` } });
}

export async function insertMessage(env: SupabaseEnv, msg: DbMessage): Promise<void> {
  await sbFetch(env, "/rest/v1/messages", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(msg) });
}
