import { Server as HttpServer } from "node:http";
import { Server as SocketServer, type Socket } from "socket.io";
import { verifyAccessToken } from "../utils/jwt.util.js";
import { logger } from "../utils/logger.util.js";

let io: SocketServer | null = null;

export function getIO(): SocketServer {
  if (!io) throw new Error("Socket.io has not been initialized");
  return io;
}

export function initializeSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use((socket: Socket, next) => {
    const token =
      socket.handshake.auth?.token ??
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.userId;
      socket.data.email = payload.email;
      socket.data.role = payload.role;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);
    logger.info("Socket connected", { userId, socketId: socket.id });

    socket.on("disconnect", (reason) => {
      logger.info("Socket disconnected", { userId, socketId: socket.id, reason });
    });
  });

  logger.info("Socket.io initialized");
  return io;
}
