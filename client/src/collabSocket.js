import { io } from "socket.io-client";
import { getToken } from "./auth.js";

// Manajer koneksi Socket.IO kolaborasi. Satu socket per sesi, dipakai
// bersama oleh seluruh file yang dibuka (room per workbook_key).
let socket = null;
let connState = "off"; // off | connecting | live | offline
const stateListeners = new Set();

function setState(s) {
  connState = s;
  stateListeners.forEach((fn) => {
    try {
      fn(s);
    } catch {
      /* abaikan */
    }
  });
}

export function collabConnState() {
  return connState;
}

export function onCollabConnState(fn) {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

export function getCollabSocket() {
  return socket;
}

// return socket yang tersambung (atau buat baru bila token berubah).
export function ensureCollabSocket() {
  const token = getToken();
  if (!token) {
    disconnectCollabSocket();
    return null;
  }
  if (socket && socket.auth.token === token && socket.connected) return socket;
  if (socket) {
    try {
      socket.disconnect();
    } catch {
      /* abaikan */
    }
    socket = null;
  }
  setState("connecting");
  socket = io({ path: "/socket.io", auth: { token } });
  socket.on("connect", () => setState("live"));
  socket.on("disconnect", () => setState("offline"));
  socket.on("connect_error", (err) => {
    if (err && err.message === "UNAUTHORIZED") setState("off");
    else setState("offline");
  });
  return socket;
}

export function disconnectCollabSocket() {
  if (socket) {
    try {
      socket.disconnect();
    } catch {
      /* abaikan */
    }
    socket = null;
  }
  setState("off");
}

// Kirim cell-op dengan promise atas ack server.
export function sendCellOp(sock, op, timeout = 12000) {
  return new Promise((resolve, reject) => {
    if (!sock || !sock.connected) {
      reject(new Error("OFFLINE"));
      return;
    }
    const t = setTimeout(() => reject(new Error("TIMEOUT")), timeout);
    sock.emit("cell-op", op, (res) => {
      clearTimeout(t);
      resolve(res || { ok: false, error: "Respons kosong" });
    });
  });
}

export function joinCollabFile(sock, payload, timeout = 12000) {
  return new Promise((resolve, reject) => {
    if (!sock || !sock.connected) {
      reject(new Error("OFFLINE"));
      return;
    }
    const t = setTimeout(() => reject(new Error("TIMEOUT")), timeout);
    sock.emit("join-file", payload, (res) => {
      clearTimeout(t);
      resolve(res || { ok: false, error: "Respons kosong" });
    });
  });
}
