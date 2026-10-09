// =====================================================================
// Real-time kolaborasi (Socket.IO):
//  - Auth memakai token sesi yang sama dengan REST (tabel sessions).
//  - Room per file: "file:<workbook_key>".
//  - Event: join-file / leave-file / cursor / cell-op (+ presence).
// Izin baca/tulis dicek di setiap aksi via collab.getWorkbookAccess.
// =====================================================================
const { Server } = require("socket.io");
const { pool } = require("./db");
const { isMaintenanceActive } = require("./auth");
const { getWorkbookAccess, resolveWorkbookKey, applyCellOp } = require("./collab");

const roomOf = (workbookKey) => `file:${workbookKey}`;

// Instance io untuk broadcast dari jalur REST (mis. row-created).
let ioInstance = null;
function getIO() {
  return ioInstance;
}
function emitToFile(workbookKey, event, payload) {
  if (ioInstance && workbookKey) ioInstance.to(roomOf(String(workbookKey))).emit(event, payload);
}

// presence: Map<room, Map<userId, { user, sockets: Set<socketId> }>>
const presence = new Map();

function presenceList(room) {
  const m = presence.get(room);
  if (!m) return [];
  return [...m.values()].map((e) => ({
    id: e.user.id,
    nama: e.user.nama,
    role: e.user.role,
    avatar: e.user.avatar || null,
  }));
}

function trackJoin(room, user, socketId) {
  if (!presence.has(room)) presence.set(room, new Map());
  const m = presence.get(room);
  if (!m.has(user.id)) {
    m.set(user.id, {
      user: { id: user.id, nama: user.nama, role: user.role, avatar: user.avatar || null },
      sockets: new Set(),
    });
  }
  m.get(user.id).sockets.add(socketId);
}

function trackLeave(room, userId, socketId) {
  const m = presence.get(room);
  if (!m) return false;
  const e = m.get(userId);
  if (!e) return false;
  e.sockets.delete(socketId);
  if (e.sockets.size === 0) m.delete(userId);
  if (m.size === 0) presence.delete(room);
  return true;
}

async function userFromToken(token) {
  const t = String(token || "").trim();
  if (!t) return null;
  const [[row]] = await pool.query(
    `SELECT s.expires_at, u.id, u.nama, u.email, u.avatar, u.role
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`,
    [t]
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return { id: row.id, nama: row.nama, email: row.email, avatar: row.avatar || null, role: row.role || "user" };
}

function attachRealtime(httpServer) {
  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: true, credentials: true },
  });
  ioInstance = io;

  io.use(async (socket, next) => {
    try {
      const user = await userFromToken(socket.handshake.auth && socket.handshake.auth.token);
      if (!user) return next(new Error("UNAUTHORIZED"));
      socket.user = user;
      next();
    } catch (err) {
      next(new Error("AUTH_ERROR"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.user;
    socket.join(`user:${user.id}`);
    socket.data.rooms = new Set();

    const broadcastPresence = (room) => {
      io.to(room).emit("presence", { users: presenceList(room) });
    };

    socket.on("join-file", async (payload, ack) => {
      try {
        const wbKey = await resolveWorkbookKey({
          sheetId: payload && payload.sheet_id,
          workbookKey: payload && payload.workbook_key,
        });
        if (!wbKey) {
          if (ack) ack({ ok: false, error: "File tidak ditemukan" });
          return;
        }
        const access = await getWorkbookAccess(user, wbKey);
        if (!access.read) {
          if (ack) ack({ ok: false, error: "Anda tidak memiliki akses ke file ini" });
          return;
        }
        const room = roomOf(wbKey);
        socket.join(room);
        socket.data.rooms.add(room);
        trackJoin(room, user, socket.id);
        if (ack) ack({ ok: true, workbook_key: wbKey, access });
        socket.to(room).emit("user-joined", { user: { id: user.id, nama: user.nama, role: user.role } });
        broadcastPresence(room);
      } catch (err) {
        if (ack) ack({ ok: false, error: "Gagal membuka file" });
      }
    });

    socket.on("leave-file", (payload) => {
      const wbKey = payload && payload.workbook_key;
      if (!wbKey) return;
      const room = roomOf(String(wbKey));
      socket.leave(room);
      socket.data.rooms.delete(room);
      trackLeave(room, user.id, socket.id);
      socket.to(room).emit("user-left", { user_id: user.id });
      broadcastPresence(room);
    });

    // Kursor/seleksi efemeral (tidak disimpan).
    socket.on("cursor", (payload) => {
      const wbKey = payload && payload.workbook_key;
      if (!wbKey) return;
      const room = roomOf(String(wbKey));
      if (!socket.data.rooms.has(room)) return;
      socket.to(room).emit("cursor", {
        user: { id: user.id, nama: user.nama, role: user.role },
        sel: payload.sel || null,
      });
    });

    // Operasi sel dengan optimistic locking. Respons via ack + broadcast.
    socket.on("cell-op", async (payload, ack) => {
      const conn = await pool.getConnection();
      try {
        const maint = await isMaintenanceActive();
        if (maint && user.role !== "super_admin") {
          if (ack) ack({ ok: false, error: "Sedang maintenance", status: 503 });
          return;
        }
        await conn.beginTransaction();
        const out = await applyCellOp(conn, {
          user,
          rowId: Number(payload && payload.row_id),
          colKey: payload && payload.col_key,
          value: payload && payload.value,
          baseVersi: payload && payload.base_versi !== undefined ? Number(payload.base_versi) : null,
        });
        if (out.error) {
          await conn.rollback();
          if (ack) ack({ ok: false, error: out.error, status: out.status });
          return;
        }
        if (out.conflict) {
          await conn.rollback();
          if (ack) ack({ ok: false, conflict: true, current: out.current });
          socket.emit("cell-conflict", { op_id: payload && payload.op_id, current: out.current });
          return;
        }
        await conn.commit();
        const wbKey = await resolveWorkbookKey({ sheetId: out.row.sheet_id });
        const msg = {
          op_id: payload && payload.op_id,
          row: out.row,
          col_key: payload && payload.col_key,
          by: { id: user.id, nama: user.nama },
        };
        if (ack) ack({ ok: true, row: out.row });
        if (wbKey) io.to(roomOf(wbKey)).emit("cell-applied", msg);
      } catch (err) {
        try {
          await conn.rollback();
        } catch { /* abaikan */ }
        if (ack) ack({ ok: false, error: "Gagal menyimpan perubahan" });
      } finally {
        conn.release();
      }
    });

    socket.on("disconnect", () => {
      for (const room of [...socket.data.rooms]) {
        trackLeave(room, user.id, socket.id);
        socket.to(room).emit("user-left", { user_id: user.id });
        broadcastPresence(room);
      }
    });
  });

  return io;
}

module.exports = { attachRealtime, getIO, emitToFile };
