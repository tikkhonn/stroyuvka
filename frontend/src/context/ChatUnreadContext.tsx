import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { api, ChatMessage } from "../api/client";
import { onWsEvent } from "../api/ws";
import { useAuth } from "./AuthContext";
import { parseCourseId } from "../lib/courseId";

export type ChatChannel = "faculty" | "dpa";

const POLL_MS = 5_000;

type ChatUnreadContextValue = {
  navHasUnread: boolean;
  channelUnread: Record<ChatChannel, boolean>;
  activeChannel: ChatChannel | null;
  setActiveChannel: (channel: ChatChannel | null) => void;
  markRead: (channel: ChatChannel, lastMessageId?: number) => void;
  refreshUnread: () => Promise<void>;
};

const ChatUnreadContext = createContext<ChatUnreadContextValue | null>(null);

function storageKey(
  channel: ChatChannel,
  facultyId: number | null,
  dutyPostId: number
) {
  const who = dutyPostId > 0 ? String(dutyPostId) : "anon";
  if (channel === "dpa") return `chat_read_v2_${who}_dpa`;
  return `chat_read_v2_${who}_faculty_${facultyId ?? "unknown"}`;
}

function getLastReadId(key: string): number {
  const n = Number(localStorage.getItem(key) || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function setLastReadId(key: string, id: number) {
  if (id > 0) localStorage.setItem(key, String(id));
}

function facultyFromSession(role: string, unitId: number | null): number | null {
  const r = role.toLowerCase();
  if (r === "dpf") return unitId;
  if (r === "dpk" && unitId) {
    try {
      return parseCourseId(unitId).faculty;
    } catch {
      return Math.floor(unitId / 10) || null;
    }
  }
  return null;
}

function channelsForRole(role: string): ChatChannel[] {
  const r = role.toLowerCase();
  if (r === "dpa") return ["dpa"];
  if (r === "dpf") return ["faculty", "dpa"];
  if (r === "dpk") return ["faculty"];
  return [];
}

function maxMessageId(msgs: ChatMessage[]): number {
  return msgs.reduce((max, m) => (m.id > max ? m.id : max), 0);
}

function hasUnreadFromOthers(
  msgs: ChatMessage[],
  lastReadId: number,
  myDutyPostId: number
): boolean {
  return msgs.some((m) => {
    if (m.id <= lastReadId) return false;
    const sender = Number(m.sender_id);
    // своё сообщение не считаем непрочитанным
    if (myDutyPostId > 0 && Number.isFinite(sender) && sender === myDutyPostId) {
      return false;
    }
    return true;
  });
}

function resolveChannel(payload: Record<string, unknown>): ChatChannel | null {
  if (!("faculty_id" in payload)) return null;
  return payload.faculty_id == null ? "dpa" : "faculty";
}

export function ChatUnreadProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();

  const role = (session?.role ?? "").toLowerCase();
  const shell = session?.shell ?? "";
  const myDutyPostId = Number(session?.duty_post_id) || 0;
  const myFaculty = facultyFromSession(role, session?.unit_id ?? null);
  const channels = useMemo(() => channelsForRole(role), [role]);
  const onChatPage = location.pathname === "/chat" || location.pathname.startsWith("/chat/");

  const [activeChannel, setActiveChannel] = useState<ChatChannel | null>(null);
  const [channelUnread, setChannelUnread] = useState<Record<ChatChannel, boolean>>({
    faculty: false,
    dpa: false,
  });

  const activeChannelRef = useRef<ChatChannel | null>(null);
  const onChatPageRef = useRef(onChatPage);
  activeChannelRef.current = activeChannel;
  onChatPageRef.current = onChatPage;

  const viewingChannel = useCallback((): ChatChannel | null => {
    return onChatPageRef.current ? activeChannelRef.current : null;
  }, []);

  const markRead = useCallback(
    (channel: ChatChannel, lastMessageId?: number) => {
      const key = storageKey(channel, myFaculty, myDutyPostId);
      const next = Math.max(getLastReadId(key), lastMessageId ?? 0);
      setLastReadId(key, next);
      setChannelUnread((s) => ({ ...s, [channel]: false }));
    },
    [myFaculty, myDutyPostId]
  );

  const bumpUnread = useCallback(
    (channel: ChatChannel) => {
      if (viewingChannel() === channel) return;
      setChannelUnread((s) => (s[channel] ? s : { ...s, [channel]: true }));
    },
    [viewingChannel]
  );

  const refreshUnread = useCallback(async () => {
    if (!session || shell !== "naryad" || channels.length === 0) {
      setChannelUnread({ faculty: false, dpa: false });
      return;
    }

    const viewing = viewingChannel();
    const next: Record<ChatChannel, boolean> = { faculty: false, dpa: false };

    const check = async (channel: ChatChannel, path: string) => {
      const msgs = await api<ChatMessage[]>(path);
      const key = storageKey(channel, myFaculty, myDutyPostId);
      if (viewing === channel) {
        markRead(channel, maxMessageId(msgs));
        next[channel] = false;
        return;
      }
      next[channel] = hasUnreadFromOthers(msgs, getLastReadId(key), myDutyPostId);
    };

    try {
      if (channels.includes("faculty") && myFaculty) {
        await check("faculty", `/api/chat/messages?limit=50&faculty_id=${myFaculty}`);
      }
      if (channels.includes("dpa")) {
        await check("dpa", "/api/chat/messages?limit=50");
      }
      setChannelUnread(next);
    } catch {
      /* сеть упала — оставляем текущий индикатор */
    }
  }, [
    session,
    shell,
    channels,
    myDutyPostId,
    myFaculty,
    markRead,
    viewingChannel,
  ]);

  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread, onChatPage, activeChannel]);

  useEffect(() => {
    if (!session || shell !== "naryad") return;
    const id = window.setInterval(() => void refreshUnread(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshUnread();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session, shell, refreshUnread]);

  useEffect(() => {
    if (!session || shell !== "naryad" || channels.length === 0) return;

    const unsub = onWsEvent((ev) => {
      if (ev.type === "CHAT_CLEARED") {
        const facultyIds = (ev.payload.faculty_ids as (number | null)[] | undefined) ?? [];
        for (const fid of facultyIds) {
          if (fid == null) {
            localStorage.removeItem(storageKey("dpa", myFaculty, myDutyPostId));
            setChannelUnread((s) => ({ ...s, dpa: false }));
          } else if (Number(fid) === myFaculty) {
            localStorage.removeItem(storageKey("faculty", myFaculty, myDutyPostId));
            setChannelUnread((s) => ({ ...s, faculty: false }));
          }
        }
        void refreshUnread();
        return;
      }

      if (ev.type !== "CHAT_MESSAGE") return;

      const channel = resolveChannel(ev.payload);
      if (!channel || !channels.includes(channel)) return;

      if (channel === "faculty") {
        if (myFaculty == null) return;
        if (Number(ev.payload.faculty_id) !== myFaculty) return;
      }

      const senderId = Number(ev.payload.sender_id);
      if (myDutyPostId > 0 && senderId === myDutyPostId) {
        // своё — не бампим; если смотрим канал, отмечаем прочитанным
        const msgId = Number(ev.payload.id) || 0;
        if (viewingChannel() === channel && msgId) markRead(channel, msgId);
        return;
      }

      const msgId = Number(ev.payload.id) || 0;
      if (viewingChannel() === channel) {
        if (msgId) markRead(channel, msgId);
        return;
      }

      // чужое и канал не открыт — сразу красный индикатор
      bumpUnread(channel);
    });

    return () => {
      unsub();
    };
  }, [
    session,
    shell,
    channels,
    myFaculty,
    myDutyPostId,
    markRead,
    bumpUnread,
    refreshUnread,
    viewingChannel,
  ]);

  const hasAnyUnread = channelUnread.faculty || channelUnread.dpa;
  const navHasUnread = !onChatPage && hasAnyUnread;

  const value = useMemo(
    () => ({
      navHasUnread,
      channelUnread,
      activeChannel,
      setActiveChannel,
      markRead,
      refreshUnread,
    }),
    [navHasUnread, channelUnread, activeChannel, markRead, refreshUnread]
  );

  return <ChatUnreadContext.Provider value={value}>{children}</ChatUnreadContext.Provider>;
}

export function useChatUnread() {
  const ctx = useContext(ChatUnreadContext);
  if (!ctx) throw new Error("useChatUnread outside provider");
  return ctx;
}
