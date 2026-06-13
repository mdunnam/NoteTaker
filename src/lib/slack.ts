// Slack attention feed — recent mentions + DMs needing a look
export interface SlackItem {
  text: string;
  from: string;
  channel: string;
  permalink: string;
  isDm: boolean;
  ts: string;
}

interface SearchMatch {
  text?: string;
  username?: string;
  permalink?: string;
  ts?: string;
  channel?: { name?: string; is_im?: boolean };
}

async function searchSlack(query: string, count = 8): Promise<SearchMatch[]> {
  const token = process.env.SLACK_USER_TOKEN;
  if (!token) return [];
  const url = `https://slack.com/api/search.messages?query=${encodeURIComponent(query)}&sort=timestamp&sort_dir=desc&count=${count}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!data.ok) return [];
  return data.messages?.matches ?? [];
}

function yesterdayStr(): string {
  const d = new Date(Date.now() - 72 * 3600 * 1000);
  return d.toISOString().split("T")[0];
}

export async function getSlackAttention(): Promise<SlackItem[]> {
  const myId = process.env.SLACK_USER_ID;
  if (!myId || !process.env.SLACK_USER_TOKEN) return [];

  const after = yesterdayStr();
  const [mentions, dms] = await Promise.all([
    searchSlack(`<@${myId}> after:${after}`),
    searchSlack(`is:dm after:${after}`),
  ]);

  const seen = new Set<string>();
  const items: SlackItem[] = [];

  for (const m of [...mentions, ...dms]) {
    if (!m.ts || seen.has(m.ts)) continue;
    // skip my own messages
    if (m.username === "m.dunnam" || m.username === "nero") continue;
    seen.add(m.ts);
    items.push({
      text: (m.text ?? "").replace(/<@[A-Z0-9]+>/g, "@").slice(0, 140),
      from: m.username ?? "unknown",
      channel: m.channel?.is_im ? "DM" : `#${m.channel?.name ?? "?"}`,
      permalink: m.permalink ?? "",
      isDm: !!m.channel?.is_im,
      ts: m.ts,
    });
  }

  return items.sort((a, b) => Number(b.ts) - Number(a.ts)).slice(0, 8);
}

export async function getSlackAttentionSafe(): Promise<SlackItem[]> {
  try {
    return await getSlackAttention();
  } catch {
    return [];
  }
}

// ---- On-demand tools for Nero ----------------------------------------------

// Lazy cache of user-id -> display name (uses users:read user scope)
let userCache: Record<string, string> | null = null;
async function getUserNames(token: string): Promise<Record<string, string>> {
  if (userCache) return userCache;
  const map: Record<string, string> = {};
  let cursor = "";
  for (let i = 0; i < 12; i++) {
    const url = `https://slack.com/api/users.list?limit=200${cursor ? `&cursor=${cursor}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!data.ok) break;
    for (const u of data.members ?? []) {
      map[u.id] = u.profile?.display_name || u.real_name || u.name || u.id;
    }
    cursor = data.response_metadata?.next_cursor ?? "";
    if (!cursor) break;
  }
  userCache = map;
  return map;
}

// Search everything Mike can see. Works with just `search:read`.
export async function searchSlackForNero(query: string, count = 12): Promise<string> {
  if (!process.env.SLACK_USER_TOKEN) return JSON.stringify({ error: "Slack not configured" });
  const matches = await searchSlack(query, Math.min(Math.max(count, 1), 20));
  return JSON.stringify({
    query,
    count: matches.length,
    results: matches.map((m) => ({
      from: m.username ?? "unknown",
      channel: m.channel?.is_im ? "DM" : `#${m.channel?.name ?? "?"}`,
      text: (m.text ?? "").replace(/<@[A-Z0-9]+>/g, "@").slice(0, 400),
      permalink: m.permalink ?? "",
      ts: m.ts,
    })),
  });
}

// Resolve "#name" / "name" / raw id to a conversation id (public + private channels)
async function resolveChannelId(token: string, channel: string): Promise<string | null> {
  if (/^[CDG][A-Z0-9]{6,}$/.test(channel)) return channel;
  const name = channel.replace(/^#/, "").toLowerCase();
  let cursor = "";
  for (let i = 0; i < 12; i++) {
    const url = `https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200${cursor ? `&cursor=${cursor}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!data.ok) return null;
    const hit = (data.channels ?? []).find((c: { id: string; name?: string }) => c.name?.toLowerCase() === name);
    if (hit) return hit.id;
    cursor = data.response_metadata?.next_cursor ?? "";
    if (!cursor) break;
  }
  return null;
}

// Read recent verbatim history of a channel. Needs channels:history / groups:history.
export async function readSlackConversation(channel: string, limit = 20): Promise<string> {
  const token = process.env.SLACK_USER_TOKEN;
  if (!token) return JSON.stringify({ error: "Slack not configured" });
  const id = await resolveChannelId(token, channel);
  if (!id) return JSON.stringify({ error: `Channel not found or not accessible: ${channel}` });

  const url = `https://slack.com/api/conversations.history?channel=${id}&limit=${Math.min(Math.max(limit, 1), 50)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!data.ok) return JSON.stringify({ error: data.error ?? "history failed", channel });

  const names = await getUserNames(token).catch(() => ({} as Record<string, string>));
  const msgs = (data.messages ?? []).reverse();
  return JSON.stringify({
    channel,
    count: msgs.length,
    messages: msgs.map((m: { user?: string; username?: string; text?: string; ts?: string }) => ({
      from: (m.user && names[m.user]) || m.username || m.user || "?",
      text: (m.text ?? "").replace(/<@([A-Z0-9]+)>/g, (_: string, id: string) => "@" + (names[id] || id)).slice(0, 600),
      ts: m.ts,
    })),
  });
}