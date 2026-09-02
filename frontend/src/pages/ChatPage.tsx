import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChatMessage, api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useChatUnread, type ChatChannel } from "../context/ChatUnreadContext";
import { onWsEvent } from "../api/ws";
import { parseCourseId } from "../lib/courseId";

function facultyFromSession(role: string, unitId: number | null): number | null {
  if (role === "dpf") return unitId;
  if (role === "dpk" && unitId) {
    try {
      return parseCourseId(unitId).faculty;
    } catch {
      return Math.floor(unitId / 10);
    }
  }
  return null;
}

export function ChatPage() {
  const { session } = useAuth();
  const { markRead, channelUnread, setActiveChannel } = useChatUnread();
  const role = session?.role || "";
  const myFaculty = facultyFromSession(role, session?.unit_id ?? null);
  const [channel, setChannel] = useState<ChatChannel>(role === "dpa" ? "dpa" : "faculty");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    setActiveChannel(channel);
    return () => setActiveChannel(null);
  }, [channel, setActiveChannel]);

  const load = () => {
    setError("");
    const url =
      channel === "dpa"
        ? "/api/chat/messages?limit=50"
        : `/api/chat/messages?limit=50&faculty_id=${myFaculty}`;
    return api<ChatMessage[]>(url)
      .then((msgs) => {
        setMessages(msgs);
        const lastId = msgs.length ? msgs[msgs.length - 1].id : 0;
        markRead(channel, lastId);
        requestAnimationFrame(scrollToBottom);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"));
  };

  useEffect(() => {
    if (channel === "faculty" && !myFaculty && role !== "dpa") return;
    load();
    const unsub = onWsEvent((ev) => {
      if (ev.type === "CHAT_MESSAGE") {
        const fid = ev.payload.faculty_id;
        const msgChannel: ChatChannel = fid == null ? "dpa" : "faculty";
        if (msgChannel === channel) load();
        return;
      }
      if (ev.type === "CHAT_CLEARED" || ev.type === "DUTY_SHIFT_CHANGED") {
        load();
      }
    });
    return () => {
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, myFaculty, role, markRead]);

  useLayoutEffect(() => {
    scrollToBottom();
  }, [messages, channel, scrollToBottom]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    const url =
      channel === "dpa"
        ? "/api/chat/messages"
        : `/api/chat/messages?faculty_id=${myFaculty}`;
    try {
      await api(url, {
        method: "POST",
        body: JSON.stringify({
          recipient_kind: "duty_post",
          recipient_id: 0,
          body,
        }),
      });
      setBody("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const title =
    channel === "dpa"
      ? "Чат ДПА ↔ ДПФ"
      : `Чат факультета (id ${myFaculty}) — ДПФ и ДПК`;

  return (
    <div>
      <h2 className="text-xl font-serif font-bold text-vka-navy mb-2">Чат</h2>
      <div className="flex gap-2 mb-3">
        {(role === "dpf" || role === "dpk") && (
          <button
            type="button"
            onClick={() => setChannel("faculty")}
            className={`relative text-sm px-3 py-1.5 rounded border ${
              channel === "faculty" ? "bg-vka-navy text-white" : "bg-white"
            }`}
          >
            Чат факультета
            {channelUnread.faculty && channel !== "faculty" && (
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500" />
            )}
          </button>
        )}
        {(role === "dpf" || role === "dpa") && (
          <button
            type="button"
            onClick={() => setChannel("dpa")}
            className={`relative text-sm px-3 py-1.5 rounded border ${
              channel === "dpa" ? "bg-vka-navy text-white" : "bg-white"
            }`}
          >
            Чат ДПА ↔ ДПФ
            {channelUnread.dpa && channel !== "dpa" && (
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500" />
            )}
          </button>
        )}
      </div>
      <p className="text-sm text-gray-600 mb-4">{title}</p>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      <div className="bg-white rounded-lg shadow flex flex-col h-[500px]">
        <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m) => (
            <div key={m.id} className="border-l-4 border-vka-gold pl-3 py-1">
              <p className="text-sm font-medium text-vka-navy">{m.sender_name}</p>
              <p className="text-gray-800">{m.body}</p>
              <p className="text-xs text-gray-400">
                {new Date(m.created_at).toLocaleString("ru-RU")}
              </p>
            </div>
          ))}
        </div>
        <form onSubmit={send} className="border-t p-3 flex gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Сообщение..."
            className="flex-1 border rounded px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="bg-vka-navy text-white px-4 py-2 rounded text-sm hover:bg-vka-navy-light"
          >
            Отправить
          </button>
        </form>
      </div>
    </div>
  );
}
