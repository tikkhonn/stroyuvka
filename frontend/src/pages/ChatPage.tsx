import {
  ClipboardEvent,
  DragEvent,
  FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ChatAttachment,
  ChatMessage,
  api,
  downloadFile,
  fetchChatAttachmentBlob,
  uploadChatFile,
} from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useChatUnread, type ChatChannel } from "../context/ChatUnreadContext";
import { onWsEvent } from "../api/ws";
import { parseCourseId } from "../lib/courseId";

const MAX_FILES = 5;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const FILE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,.pdf,.doc,.docx,.xls,.xlsx,application/pdf";

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

function formatBytes(size: number): string {
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} КБ`;
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
}

function isImageAttachment(att: ChatAttachment): boolean {
  return att.content_type.startsWith("image/");
}

type PendingFile = {
  key: string;
  file: File;
  previewUrl?: string;
};

function validateFiles(files: File[], existingCount: number): { ok: File[]; error?: string } {
  const room = MAX_FILES - existingCount;
  if (room <= 0) {
    return { ok: [], error: `Не больше ${MAX_FILES} файлов в сообщении` };
  }
  const accepted: File[] = [];
  for (const file of files) {
    if (accepted.length >= room) break;
    if (file.size > MAX_FILE_BYTES) {
      return { ok: [], error: `«${file.name}» больше 8 МБ` };
    }
    accepted.push(file);
  }
  if (files.length > room && accepted.length === room) {
    return { ok: accepted, error: `Добавлено ${room} из ${files.length}: лимит ${MAX_FILES} файлов` };
  }
  return { ok: accepted };
}

function AttachmentImage({ att }: { att: ChatAttachment }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    void fetchChatAttachmentBlob(att.id)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [att.id]);

  const open = async () => {
    try {
      const blob = await fetchChatAttachmentBlob(att.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setFailed(true);
    }
  };

  if (failed) {
    return (
      <button
        type="button"
        onClick={() => void downloadFile(`/api/chat/attachments/${att.id}`, att.original_filename)}
        className="text-xs text-vka-navy underline"
      >
        {att.original_filename}
      </button>
    );
  }

  if (!src) {
    return <div className="h-24 w-24 rounded bg-gray-100 animate-pulse" />;
  }

  return (
    <button type="button" onClick={() => void open()} className="block">
      <img
        src={src}
        alt={att.original_filename}
        className="max-h-40 max-w-full rounded border border-gray-200 object-cover hover:opacity-90"
      />
    </button>
  );
}

function AttachmentDoc({ att }: { att: ChatAttachment }) {
  return (
    <button
      type="button"
      onClick={() => void downloadFile(`/api/chat/attachments/${att.id}`, att.original_filename)}
      className="flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm hover:bg-gray-100"
    >
      <span className="text-lg" aria-hidden>
        📄
      </span>
      <span>
        <span className="block font-medium text-vka-navy truncate max-w-[220px]">
          {att.original_filename}
        </span>
        <span className="text-xs text-gray-500">{formatBytes(att.size_bytes)}</span>
      </span>
    </button>
  );
}

function MessageAttachments({ attachments }: { attachments: ChatAttachment[] }) {
  if (!attachments.length) return null;
  const images = attachments.filter(isImageAttachment);
  const docs = attachments.filter((a) => !isImageAttachment(a));

  return (
    <div className="mt-2 space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((att) => (
            <AttachmentImage key={att.id} att={att} />
          ))}
        </div>
      )}
      {docs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {docs.map((att) => (
            <AttachmentDoc key={att.id} att={att} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatPage() {
  const { session } = useAuth();
  const { markRead, channelUnread, setActiveChannel } = useChatUnread();
  const role = session?.role || "";
  const myFaculty = facultyFromSession(role, session?.unit_id ?? null);
  const [channel, setChannel] = useState<ChatChannel>(role === "dpa" ? "dpa" : "faculty");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const channelFacultyId = channel === "dpa" ? null : myFaculty;

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

  useEffect(() => {
    return () => {
      pendingFiles.forEach((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      });
    };
  }, [pendingFiles]);

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    const { ok, error: validationError } = validateFiles(list, pendingFiles.length);
    if (validationError) setError(validationError);
    else setError("");
    if (!ok.length) return;

    const next: PendingFile[] = ok.map((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));
    setPendingFiles((prev) => [...prev, ...next].slice(0, MAX_FILES));
  };

  const removePending = (key: string) => {
    setPendingFiles((prev) => {
      const item = prev.find((p) => p.key === key);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length) {
      e.preventDefault();
      addFiles(imageFiles);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text && pendingFiles.length === 0) return;

    const url =
      channel === "dpa"
        ? "/api/chat/messages"
        : `/api/chat/messages?faculty_id=${myFaculty}`;

    setSending(true);
    setError("");
    try {
      const uploadIds: number[] = [];
      for (const pending of pendingFiles) {
        const uploaded = await uploadChatFile(pending.file, channelFacultyId);
        uploadIds.push(uploaded.id);
      }
      await api(url, {
        method: "POST",
        body: JSON.stringify({
          recipient_kind: "duty_post",
          recipient_id: 0,
          body: text,
          upload_ids: uploadIds,
        }),
      });
      pendingFiles.forEach((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      });
      setBody("");
      setPendingFiles([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSending(false);
    }
  };

  const title = channel === "dpa" ? "Чат ДПА ↔ ДПФ" : "Чат факультета — ДПФ и ДПК";

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
      <div
        className={`bg-white rounded-lg shadow flex flex-col h-[500px] ${
          dragOver ? "ring-2 ring-vka-gold ring-offset-2" : ""
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m) => (
            <div key={m.id} className="border-l-4 border-vka-gold pl-3 py-1">
              <p className="text-sm font-medium text-vka-navy">{m.sender_name}</p>
              {m.body ? <p className="text-gray-800 whitespace-pre-wrap">{m.body}</p> : null}
              {m.attachments && m.attachments.length > 0 ? (
                <MessageAttachments attachments={m.attachments} />
              ) : null}
              <p className="text-xs text-gray-400 mt-1">
                {new Date(m.created_at).toLocaleString("ru-RU")}
              </p>
            </div>
          ))}
        </div>
        {pendingFiles.length > 0 && (
          <div className="border-t px-3 py-2 flex flex-wrap gap-2 bg-gray-50">
            {pendingFiles.map((p) => (
              <div
                key={p.key}
                className="flex items-center gap-2 rounded border border-gray-200 bg-white px-2 py-1 text-xs"
              >
                {p.previewUrl ? (
                  <img src={p.previewUrl} alt="" className="h-8 w-8 rounded object-cover" />
                ) : (
                  <span aria-hidden>📄</span>
                )}
                <span className="max-w-[120px] truncate">{p.file.name}</span>
                <span className="text-gray-400">{formatBytes(p.file.size)}</span>
                <button
                  type="button"
                  onClick={() => removePending(p.key)}
                  className="text-red-600 hover:underline"
                  aria-label="Убрать файл"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={send} className="border-t p-3 flex gap-2 items-end">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={FILE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || pendingFiles.length >= MAX_FILES}
            className="shrink-0 rounded border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40"
            title="Прикрепить файл"
            aria-label="Прикрепить файл"
          >
            📎
          </button>
          <input
            ref={inputRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onPaste={onPaste}
            placeholder="Сообщение..."
            className="flex-1 border rounded px-3 py-2 text-sm"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || (!body.trim() && pendingFiles.length === 0)}
            className="bg-vka-navy text-white px-4 py-2 rounded text-sm hover:bg-vka-navy-light disabled:opacity-40"
          >
            {sending ? "…" : "Отправить"}
          </button>
        </form>
      </div>
    </div>
  );
}
