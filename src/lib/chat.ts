import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_BASE, hasBackend } from './api';
import { deviceId } from './device';

import { profile } from '@/data/myroute';

const THREADS_KEY = 'myroute:chat-threads';
const MESSAGES_KEY = 'myroute:chat-messages';

export { deviceId };

export type ChatKind = 'community' | 'direct';

export type ChatThread = {
  id: string;
  title: string;
  kind: ChatKind;
  createdAt: number;
  /** Newest message in the thread, used for list ordering. */
  lastMessageAt: number;
};

export type ChatMessage = {
  /** Client-generated so the same message is never stored twice. */
  id: string;
  threadId: string;
  authorId: string;
  authorName: string;
  kind: 'text' | 'location';
  body: string;
  latitude?: number;
  longitude?: number;
  createdAt: number;
};

/** Every install belongs to one room: the neighbourhood thread. */
export const COMMUNITY_THREAD_ID = 'community';
export const COMMUNITY_THREAD_TITLE = 'Neighbourhood';

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function write(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best effort: a full disk should not break the composer.
  }
}

// ── Threads ──────────────────────────────────────────────────────────────────

async function allMessages(): Promise<Record<string, ChatMessage[]>> {
  return read<Record<string, ChatMessage[]>>(MESSAGES_KEY, {});
}

function newest(messages: ChatMessage[]): number {
  return messages.reduce((max, message) => Math.max(max, message.createdAt), 0);
}

/** Community room first, then direct threads with the most recent activity. */
export async function loadThreads(): Promise<ChatThread[]> {
  const [stored, messages] = await Promise.all([
    read<ChatThread[]>(THREADS_KEY, []),
    allMessages(),
  ]);
  const community: ChatThread = {
    id: COMMUNITY_THREAD_ID,
    title: COMMUNITY_THREAD_TITLE,
    kind: 'community',
    createdAt: 0,
    lastMessageAt: newest(messages[COMMUNITY_THREAD_ID] ?? []),
  };
  const direct = stored
    .filter((thread) => thread.id !== COMMUNITY_THREAD_ID)
    .map((thread) => ({
      ...thread,
      lastMessageAt: Math.max(thread.lastMessageAt, newest(messages[thread.id] ?? [])),
    }))
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  return [community, ...direct];
}

export async function getThread(id: string): Promise<ChatThread | null> {
  const threads = await loadThreads();
  return threads.find((thread) => thread.id === id) ?? null;
}

/** The newest message per thread, for the list previews. */
export async function loadLastMessages(): Promise<Record<string, ChatMessage>> {
  const all = await allMessages();
  const latest: Record<string, ChatMessage> = {};
  Object.entries(all).forEach(([threadId, messages]) => {
    const last = [...messages].sort((a, b) => b.createdAt - a.createdAt)[0];
    if (last) {
      latest[threadId] = last;
    }
  });
  return latest;
}

/** `14:05` today, otherwise `9/10` — avoids `toLocale*` for Hermes/Android. */
export function formatChatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  if (date.toDateString() === now.toDateString()) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

/** Start a 1:1 thread (used by "New chat"). */
export async function createThread(title: string): Promise<ChatThread> {
  const thread: ChatThread = {
    id: makeId('thread'),
    title: title.trim() || 'New chat',
    kind: 'direct',
    createdAt: Date.now(),
    lastMessageAt: 0,
  };
  const stored = await read<ChatThread[]>(THREADS_KEY, []);
  await write(THREADS_KEY, [thread, ...stored]);
  return thread;
}

// ── Messages ─────────────────────────────────────────────────────────────────

export async function loadMessages(threadId: string): Promise<ChatMessage[]> {
  const messages = await allMessages();
  return (messages[threadId] ?? []).sort((a, b) => a.createdAt - b.createdAt);
}

async function storeMessages(threadId: string, messages: ChatMessage[]): Promise<void> {
  const all = await allMessages();
  all[threadId] = [...messages].sort((a, b) => a.createdAt - b.createdAt);
  await write(MESSAGES_KEY, all);
}

/** A message as the API returns it: camelCase fields, ISO 8601 timestamp. */
type MessageRow = {
  id: string;
  threadId?: string;
  authorId?: string | null;
  authorName?: string | null;
  kind?: string | null;
  body?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  createdAt?: string | number;
};

/**
 * The app works in epoch milliseconds (`createdAt` is a number everywhere in
 * the UI), so the ISO 8601 string from the API is converted here, at the
 * boundary — not in the screens.
 */
function fromRow(row: MessageRow, threadId: string): ChatMessage {
  const kind = row.kind === 'location' ? 'location' : 'text';
  const createdAt =
    typeof row.createdAt === 'number'
      ? row.createdAt
      : typeof row.createdAt === 'string'
        ? Date.parse(row.createdAt)
        : Date.now();
  return {
    id: String(row.id),
    threadId: row.threadId ?? threadId,
    authorId: String(row.authorId ?? ''),
    authorName: String(row.authorName ?? 'Neighbour'),
    kind,
    body: String(row.body ?? ''),
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
  };
}

async function push(message: ChatMessage): Promise<void> {
  if (!hasBackend) {
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // The local id is the idempotency key: a retried send replaces rather
        // than duplicates.
        clientId: message.id,
        threadId: message.threadId,
        authorId: message.authorId,
        authorName: message.authorName,
        kind: message.kind,
        body: message.body,
        latitude: message.latitude,
        longitude: message.longitude,
      }),
    });
    if (!response.ok) {
      throw new Error(`messages failed (${response.status})`);
    }

    // Adopt the server's timestamp. The poll cursor is derived from the newest
    // local message, and a device clock ahead of the server would otherwise
    // make every later message look older than the cursor and never fetch it.
    const saved = (await response.json()) as MessageRow;
    const serverTime =
      typeof saved.createdAt === 'string' ? Date.parse(saved.createdAt) : Number(saved.createdAt);
    if (Number.isFinite(serverTime) && serverTime !== message.createdAt) {
      const stored = await loadMessages(message.threadId);
      await storeMessages(
        message.threadId,
        stored.map((existing) =>
          existing.id === message.id ? { ...existing, createdAt: serverTime } : existing,
        ),
      );
    }
  } catch {
    // Offline: the message stays on the device and the next sync retries it.
  }
}

async function send(input: {
  threadId: string;
  kind: ChatMessage['kind'];
  body: string;
  latitude?: number;
  longitude?: number;
}): Promise<ChatMessage> {
  const authorId = await deviceId();
  const message: ChatMessage = {
    id: makeId('msg'),
    threadId: input.threadId,
    authorId,
    authorName: profile.name,
    kind: input.kind,
    body: input.body,
    latitude: input.latitude,
    longitude: input.longitude,
    createdAt: Date.now(),
  };
  const existing = await loadMessages(input.threadId);
  await storeMessages(input.threadId, [...existing, message]);
  void push(message);
  return message;
}

export function sendText(threadId: string, body: string): Promise<ChatMessage> {
  return send({ threadId, kind: 'text', body });
}

export function sendLocation(
  threadId: string,
  coords: { latitude: number; longitude: number },
  label: string,
): Promise<ChatMessage> {
  return send({
    threadId,
    kind: 'location',
    body: label,
    latitude: coords.latitude,
    longitude: coords.longitude,
  });
}

/**
 * Pull anything new from the API and merge it into the local thread.
 * Without a backend this is just the local list.
 */
export async function syncMessages(threadId: string): Promise<ChatMessage[]> {
  const local = await loadMessages(threadId);
  if (!hasBackend) {
    return local;
  }
  try {
    const since = newest(local);
    const response = await fetch(
      `${API_BASE}/messages?thread=${encodeURIComponent(threadId)}&since=${since}`,
    );
    if (!response.ok) {
      throw new Error(`messages failed (${response.status})`);
    }
    const body = (await response.json()) as { data?: MessageRow[] };
    const rows = Array.isArray(body.data) ? body.data : [];
    const merged = [...local];
    rows.forEach((row) => {
      const message = fromRow(row, threadId);
      if (!merged.some((existing) => existing.id === message.id)) {
        merged.push(message);
      }
    });
    await storeMessages(threadId, merged);
    return merged;
  } catch {
    return local;
  }
}
