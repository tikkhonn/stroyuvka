type Handler = (event: { type: string; payload: Record<string, unknown> }) => void;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let currentToken: string | null = null;
const handlers = new Set<Handler>();

function wsUrl(token: string): string {
  const base = import.meta.env.VITE_API_URL || "";
  if (base) {
    return base.replace(/^http/, "ws") + `/ws?token=${token}`;
  }
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws?token=${token}`;
}

function scheduleReconnect() {
  if (!currentToken || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (currentToken) openSocket(currentToken);
  }, 3000);
}

function openSocket(token: string) {
  ws = new WebSocket(wsUrl(token));

  ws.onopen = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      handlers.forEach((h) => h(data));
    } catch {
      /* ignore */
    }
  };

  ws.onclose = () => {
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws?.close();
  };
}

export function connectWebSocket(token: string) {
  if (token !== currentToken) {
    currentToken = token;
    ws?.close();
    ws = null;
  } else if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
    return;
  }

  currentToken = token;
  openSocket(token);
}

export function onWsEvent(handler: Handler) {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function disconnectWebSocket() {
  currentToken = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  ws?.close();
  ws = null;
}
