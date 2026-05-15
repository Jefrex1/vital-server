import { useRef, useCallback, useEffect } from "react";
import { WS_URL } from "@/constants/themes";

export function useWebSocket(onMessage: (msg: any) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMsgRef = useRef(onMessage);

  onMsgRef.current = onMessage;

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState < 2) {
      return wsRef.current;
    }

    const ws = new WebSocket(WS_URL);
    ws.onmessage = (e) => {
      try {
        onMsgRef.current(JSON.parse(e.data));
      } catch {}
    };

    wsRef.current = ws;
    return ws;
  }, []);

  const send = useCallback(
    (msg: object) => {
      const ws = connect();
      const doSend = () => ws.send(JSON.stringify(msg));

      if (ws.readyState === WebSocket.OPEN) {
        doSend();
      } else {
        ws.addEventListener("open", doSend, { once: true });
      }
    },
    [connect]
  );

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { send, wsRef };
}
