import { io, Socket } from "socket.io-client";
import { store } from "../store/store";
import { addNotification, incrementUnreadCount } from "../store/slices/notification.slice";
import { showInAppNotificationToast } from "../utils/inAppNotificationToast";

const SOCKET_URL = (() => {
  try {
    return new URL(import.meta.env.VITE_API_BASE_URL as string).origin;
  } catch {
    return window.location.origin;
  }
})();

let socket: Socket | null = null;

export function connectSocket(token: string): void {
  if (socket?.connected) return;

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ["websocket", "polling"],
    withCredentials: true,
  });

  socket.on("connect", () => {
    console.info("[Socket] Connected:", socket?.id);
  });

  socket.on("notification:new", (notification) => {
    store.dispatch(addNotification(notification));
    store.dispatch(incrementUnreadCount());
    showInAppNotificationToast(notification);
  });

  socket.on("disconnect", (reason) => {
    console.info("[Socket] Disconnected:", reason);
  });

  socket.on("connect_error", (err) => {
    console.warn("[Socket] Connection error:", err.message);
  });
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}
