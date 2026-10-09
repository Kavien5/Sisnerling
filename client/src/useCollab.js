import React from "react";
import { api } from "./api.js";
import { getUser, getToken } from "./auth.js";
import { getCollabLink } from "./collabLinks.js";
import {
  ensureCollabSocket,
  joinCollabFile,
  sendCellOp,
  onCollabConnState,
  collabConnState,
} from "./collabSocket.js";

const FLUSH_DELAY = 900;
const CURSOR_THROTTLE = 600;

// Alias label -> kunci server standar (fallback bila tautan lama tak punya kolom).
const LABEL_ALIAS = {
  kode: "kode", "kode barang": "kode", no: "kode", nomor: "kode",
  nama: "nama", "nama barang": "nama", uraian: "nama",
  jumlah: "jumlah", qty: "jumlah", kuantitas: "jumlah", volume: "jumlah",
  harga: "harga", "harga satuan": "harga", nilai: "harga",
  tanggal: "tanggal", tgl: "tanggal", date: "tanggal",
  status: "status",
  keterangan: "keterangan", ket: "keterangan", catatan: "keterangan",
};
const normLabel = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function buildColMap(localColumns, serverKolom) {
  const localToServer = new Map();
  const serverToLocal = new Map();
  let kodeLocalKey = null;
  const localByNorm = new Map();
  for (const c of localColumns || []) {
    const n = normLabel(c.label || c.key);
    if (n && !localByNorm.has(n)) localByNorm.set(n, c.key);
  }
  if (Array.isArray(serverKolom) && serverKolom.length) {
    for (const sk of serverKolom) {
      const hit = localByNorm.get(normLabel(sk.label)) ?? localByNorm.get(normLabel(sk.key));
      if (hit) {
        localToServer.set(hit, sk.key);
        if (!serverToLocal.has(sk.key)) serverToLocal.set(sk.key, hit);
        if (sk.key === "kode") kodeLocalKey = hit;
      }
    }
  } else {
    // Tautan lama: cocokkan label lokal ke kunci standar via alias.
    for (const c of localColumns || []) {
      const sk = LABEL_ALIAS[normLabel(c.label || c.key)];
      if (sk) {
        localToServer.set(c.key, sk);
        if (!serverToLocal.has(sk)) serverToLocal.set(sk, c.key);
        if (sk === "kode") kodeLocalKey = c.key;
      }
    }
  }
  return { localToServer, serverToLocal, kodeLocalKey };
}

const sameVal = (a, b) => {
  if (a === b) return true;
  const sa = a === null || a === undefined ? "" : String(a);
  const sb = b === null || b === undefined ? "" : String(b);
  if (sa === sb) return true;
  const na = Number(sa.replace(/[Rp\s.]/g, "").replace(",", "."));
  const nb = Number(sb.replace(/[Rp\s.]/g, "").replace(",", "."));
  return sa !== "" && sb !== "" && Number.isFinite(na) && Number.isFinite(nb) && na === nb;
};

// Cari tautan sheet server untuk sheet lokal.
// 1) nama persis, 2) akhiran setelah "@" (format publish multi-sheet
// "fileStem@NamaWs"), 3) fallback 1:1 bila masing-masing hanya satu sheet
// (publish single-sheet memakai nama file sebagai nama sheet server).
function findSheetLink(sheetLinks, localName, localIdx, localCount) {
  const up = String(localName || "").toUpperCase();
  let hit = (sheetLinks || []).find((x) => String(x.sheetName || "").toUpperCase() === up);
  if (hit) return hit;
  hit = (sheetLinks || []).find(
    (x) => String(x.sheetName || "").toUpperCase().split("@").pop() === up
  );
  if (hit) return hit;
  if ((sheetLinks || []).length === 1 && localCount === 1) return sheetLinks[0];
  if ((sheetLinks || []).length > localIdx && (sheetLinks || [])[localIdx]) {
    // Posisi sama sebagai usaha terakhir (urutan publish = urutan workbook).
    return sheetLinks[localIdx];
  }
  return null;
}

const queueKey = (fileId) => `sisnerling_collab_queue:${fileId}`;
function loadQueue(fileId) {
  try {
    const arr = JSON.parse(localStorage.getItem(queueKey(fileId)) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function persistQueue(fileId, q) {
  try {
    if (!q.length) localStorage.removeItem(queueKey(fileId));
    else localStorage.setItem(queueKey(fileId), JSON.stringify(q.slice(0, 300)));
  } catch {
    /* abaikan */
  }
}

function colorFor(id) {
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${h}, 70%, 45%)`;
}

/**
 * Hook kolaborasi untuk satu file aktif yang tertaut ke sheet server.
 * - opts: { activeFile, getSheet, activeSheetIdx, activeCell, applySilent, toast }
 * - applySilent(sheetIdx, updater): seperti updateSheet(idx, fn, false).
 */
export function useCollab({ activeFile, getSheet, activeSheetIdx, activeCell, applySilent, toast }) {
  const [mode, setMode] = React.useState("off");
  const [access, setAccess] = React.useState(null);
  const [users, setUsers] = React.useState([]);
  const [saveStatus, setSaveStatus] = React.useState("idle");
  const [pendingCount, setPendingCount] = React.useState(0);
  const [conflicts, setConflicts] = React.useState([]);
  const [cursors, setCursors] = React.useState({});
  const [shares, setShares] = React.useState([]);
  const [revisions, setRevisions] = React.useState([]);
  const [lastSavedAt, setLastSavedAt] = React.useState(null);
  const [workbookKey, setWorkbookKey] = React.useState(null);
  const [lastEdit, setLastEdit] = React.useState(null); // { byNama, at, kode }
  const [relinkTick, setRelinkTick] = React.useState(0);
  const relink = () => setRelinkTick((t) => t + 1);

  const st = React.useRef({
    setupId: 0, link: null, wbKey: null, sheetLinks: [],
    versionByKode: new Map(), idToKode: new Map(),
    colMaps: {}, queue: [], flushTimer: null, cursorTimer: null,
    sock: null, handlers: null, cursorPrune: null,
  });
  const me = getUser();

  const setQueue = (q) => {
    st.current.queue = q;
    setPendingCount(q.length);
    persistQueue(activeFile?.id, q);
  };

  // ---------- setup / teardown ----------
  React.useEffect(() => {
    const S = st.current;
    const mySetup = ++S.setupId;
    // Bersihkan sesi sebelumnya.
    if (S.flushTimer) clearTimeout(S.flushTimer);
    if (S.cursorPrune) clearInterval(S.cursorPrune);
    if (S.sock && S.handlers) {
      const { handlers, wbKey } = S;
      ["presence", "cell-applied", "cell-conflict", "row-created", "row-deleted", "cursor"].forEach((ev) => {
        try { S.sock.off(ev, handlers[ev]); } catch { /* abaikan */ }
      });
      if (wbKey) {
        try { S.sock.emit("leave-file", { workbook_key: wbKey }); } catch { /* abaikan */ }
      }
      S.handlers = null;
      S.wbKey = null;
    }
    S.versionByKode = new Map();
    S.idToKode = new Map();
    S.colMaps = {};
    setQueue([]);
    setUsers([]);
    setCursors({});
    setConflicts([]);
    setAccess(null);
    setWorkbookKey(null);
    setShares([]);
    setRevisions([]);
    setSaveStatus("idle");

    const link = getCollabLink(activeFile?.id);
    if (!link || !getToken()) {
      setMode("off");
      return;
    }
    S.link = link;
    S.sheetLinks = link.sheets || [];
    setWorkbookKey(link.workbookKey);
    setMode("connecting");

    const boot = async () => {
      try {
        // 1. Akses saya.
        const acc = await api.collabAccess(link.workbookKey);
        if (mySetup !== S.setupId) return;
        setAccess(acc);
        if (!acc.read) {
          setMode("denied");
          return;
        }
        // 2. Ambil baris server per sheet tertaut.
        for (let i = 0; i < S.sheetLinks.length; i++) {
          const sl = S.sheetLinks[i];
          try {
            const res = await api.getSpreadsheetData(sl.sheetId);
            if (mySetup !== S.setupId) return;
            for (const r of res.data || []) {
              const kode = String(r.kode || "").trim();
              if (!kode) continue;
              S.versionByKode.set(kode, { id: r.id, versi: Number(r.versi) || 1 });
              S.idToKode.set(r.id, kode);
            }
          } catch (e) {
            if (mySetup !== S.setupId) return;
            // Sheet terhapus di server: lewati.
          }
        }
        // 3. Peta kolom per sheet lokal (dihitung ulang saat flush agar
        //    tahan terhadap tambah/hapus kolom).
        // 4. Antrean tertunda dari sesi lalu (refresh saat offline).
        const pending = loadQueue(activeFile.id);
        if (pending.length) setQueue(pending);
        // 5. Gabung room socket.
        const sock = ensureCollabSocket();
        S.sock = sock;
        if (!sock) {
          setMode(acc.write ? "offline" : "live");
          if (pending.length && navigator.onLine) void flushQueue();
          return;
        }
        const join = (s) => {
          if (s !== sock) return;
          joinCollabFile(sock, { workbook_key: link.workbookKey })
            .then((res) => {
              if (mySetup !== S.setupId) return;
              if (res.ok) {
                S.wbKey = link.workbookKey;
                attachHandlers(sock, S, mySetup);
                setMode("live");
                if (loadQueue.length || S.queue.length) void flushQueue();
              } else {
                setMode("denied");
                toast(res.error || "Tidak dapat membuka kolaborasi file ini", "error");
              }
            })
            .catch(() => {
              if (mySetup !== S.setupId) return;
              setMode("offline");
              if (S.queue.length) void flushQueue();
            });
        };
        if (sock.connected) join(sock);
        else {
          setMode("connecting");
          sock.once("connect", () => join(sock));
          setTimeout(() => {
            if (mySetup === S.setupId && !S.wbKey) setMode(sock.connected ? "connecting" : "offline");
          }, 6000);
        }
      } catch (e) {
        if (mySetup !== S.setupId) return;
        setMode("error");
      }
    };
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile?.id, relinkTick]);

  const attachHandlers = (sock, S, mySetup) => {
    const handlers = {
      presence: ({ users: u }) => {
        if (mySetup !== S.setupId) return;
        setUsers(Array.isArray(u) ? u : []);
      },
      "cell-applied": (msg) => {
        if (mySetup !== S.setupId) return;
        onRemoteCell(msg);
      },
      "cell-conflict": ({ current }) => {
        if (mySetup !== S.setupId) return;
        // Konflik dari jalur socket: perlakukan seperti 409.
        if (current) toast(`Sel diubah ${current.updated_by_nama || "pengguna lain"} — memuat nilai terbaru`, "error");
      },
      "row-created": ({ row, by }) => {
        if (mySetup !== S.setupId) return;
        onRemoteRowCreated(row, by);
      },
      "row-deleted": ({ row_id, by }) => {
        if (mySetup !== S.setupId) return;
        onRemoteRowDeleted(row_id, by);
      },
      cursor: ({ user, sel }) => {
        if (mySetup !== S.setupId || !user || user.id === me?.id) return;
        setCursors((prev) => ({
          ...prev,
          [user.id]: { nama: user.nama, sel, color: colorFor(user.id), at: Date.now() },
        }));
      },
    };
    S.handlers = handlers;
    Object.entries(handlers).forEach(([ev, fn]) => sock.on(ev, fn));
    if (!S.cursorPrune) {
      S.cursorPrune = setInterval(() => {
        const now = Date.now();
        setCursors((prev) => {
          const next = {};
          let changed = false;
          for (const [k, v] of Object.entries(prev)) {
            if (now - v.at < 12000) next[k] = v;
            else changed = true;
          }
          return changed ? next : prev;
        });
      }, 5000);
    }
  };

  // Status koneksi global -> mode.
  React.useEffect(() => {
    const off = onCollabConnState((s) => {
      const S = st.current;
      if (!S.link) return;
      if (s === "live" && S.wbKey) {
        setMode((m) => (m === "live" ? m : "live"));
        if (S.queue.length) void flushQueue();
      } else if (s === "offline" || s === "connecting") {
        setMode((m) => (m === "live" ? "offline" : m));
      }
    });
    const onNet = () => {
      const S = st.current;
      if (!S.link) return;
      if (!navigator.onLine) {
        setMode((m) => (m === "live" ? "offline" : m));
      } else if (S.queue.length) {
        void flushQueue();
      }
    };
    window.addEventListener("online", onNet);
    window.addEventListener("offline", onNet);
    return () => {
      off();
      window.removeEventListener("online", onNet);
      window.removeEventListener("offline", onNet);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colMapFor = (sheetIdx) => {
    const S = st.current;
    const sheet = getSheet(sheetIdx);
    if (!sheet) return null;
    const sl = findSheetLink(S.sheetLinks, sheet.name, sheetIdx, sheetCount());
    const sig = `${(sheet.columns || []).length}:${(sheet.columns || []).map((c) => c.key).join(",")}`;
    const cached = S.colMaps[sheetIdx];
    if (cached && cached.sig === sig) return cached.map;
    const map = buildColMap(sheet.columns, sl?.kolom);
    S.colMaps[sheetIdx] = { sig, map };
    return map;
  };

  // ---------- diff lokal -> antrean ----------
  const onLocalRows = (sheetIdx, prevRows, newRows) => {
    const S = st.current;
    if (!S.link || !access?.write) return;
    // Hanya sheet yang tertaut ke server yang disinkronkan.
    const sheet = getSheet(sheetIdx);
    const linkedSheet = sheet && findSheetLink(S.sheetLinks, sheet.name, sheetIdx, sheetCount());
    if (!linkedSheet) return;
    const cmap = colMapFor(sheetIdx);
    if (!cmap || !cmap.kodeLocalKey) return;
    const prevByKode = new Map();
    for (const r of prevRows || []) {
      const k = String(r[cmap.kodeLocalKey] ?? "").trim();
      if (k && !prevByKode.has(k)) prevByKode.set(k, r);
    }
    const ops = [];
    for (const r of newRows || []) {
      const kode = String(r[cmap.kodeLocalKey] ?? "").trim();
      if (!kode) continue;
      const prev = prevByKode.get(kode);
      const ver = S.versionByKode.get(kode);
      for (const [localKey, serverKey] of cmap.localToServer) {
        if (localKey === cmap.kodeLocalKey) continue;
        const nv = r[localKey];
        const pv = prev ? prev[localKey] : undefined;
        if (prev && sameVal(pv, nv)) continue;
        // Nilai rumus lokal tidak dikirim (terkunci di server).
        if (typeof nv === "string" && nv.startsWith("=")) continue;
        ops.push({
          op_id: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`,
          sheetIdx,
          sheetId: sheetIdOf(sheetIdx),
          rowKode: kode,
          rowId: ver ? ver.id : null,
          base_versi: ver ? ver.versi : null,
          localColKey: localKey,
          serverColKey: serverKey,
          value: nv === undefined || nv === null ? "" : nv,
          isCreate: !ver,
        });
      }
    }
    if (ops.length) {
      setQueue([...S.queue, ...ops]);
      setSaveStatus("menyimpan");
      scheduleFlush();
    }
  };

  const sheetCount = () => {
    let n = 0;
    while (getSheet(n)) {
      n++;
      if (n > 50) break;
    }
    return n;
  };

  const sheetIdOf = (sheetIdx) => {
    const S = st.current;
    const sheet = getSheet(sheetIdx);
    if (!sheet) return null;
    const sl = findSheetLink(S.sheetLinks, sheet.name, sheetIdx, sheetCount());
    return sl ? sl.sheetId : null;
  };

  const onRowsDeleted = (sheetIdx, deletedRows) => {
    const S = st.current;
    if (!S.link || !access?.write || !deletedRows?.length) return;
    const cmap = colMapFor(sheetIdx);
    if (!cmap || !cmap.kodeLocalKey) return;
    (async () => {
      let changed = false;
      for (const r of deletedRows) {
        const kode = String(r[cmap.kodeLocalKey] ?? "").trim();
        const ver = kode && S.versionByKode.get(kode);
        if (!ver) continue;
        try {
          await api.collabDeleteRow(ver.id);
          S.versionByKode.delete(kode);
          S.idToKode.delete(ver.id);
          changed = true;
        } catch (e) {
          toast(`Gagal menghapus baris ${kode} di server: ${e.message}`, "error");
        }
      }
      if (changed) {
        setSaveStatus("tersimpan");
        setLastSavedAt(new Date());
      }
    })();
  };

  const scheduleFlush = () => {
    const S = st.current;
    if (S.flushTimer) clearTimeout(S.flushTimer);
    S.flushTimer = setTimeout(() => void flushQueue(), FLUSH_DELAY);
  };

  const flushQueue = async () => {
    const S = st.current;
    if (!S.queue.length || !access?.write) return;
    // Jangan kirim ulang sel yang sedang konflik menunggu keputusan.
    const conflictKeys = new Set(conflicts.map((c) => `${c.rowKode}::${c.serverColKey}`));
    const ops = S.queue.filter((o) => !conflictKeys.has(`${o.rowKode}::${o.serverColKey}`));
    if (!ops.length) return;
    const sock = S.sock;
    const online = navigator.onLine;
    const useSocket = sock && sock.connected && S.wbKey;

    if (!online && !useSocket) {
      setSaveStatus("offline");
      return;
    }
    setSaveStatus("menyimpan");
    const remaining = [...S.queue];
    const dropOp = (op) => {
      const i = remaining.findIndex((x) => x.op_id === op.op_id);
      if (i >= 0) remaining.splice(i, 1);
    };

    // Baris baru (tanpa rowId) selalu via REST create.
    for (const op of ops.filter((o) => o.isCreate)) {
      try {
        const body = fullRowBody(op.sheetIdx, op.rowKode);
        if (!body) {
          dropOp(op);
          continue;
        }
        const res = await api.collabCreateRow(op.sheetId, body);
        S.versionByKode.set(op.rowKode, { id: res.row.id, versi: res.row.versi });
        S.idToKode.set(res.row.id, op.rowKode);
        // Tandai op sel lain untuk baris yang sama agar memakai id baru.
        for (const q of remaining) {
          if (q.rowKode === op.rowKode && q.isCreate) {
            q.rowId = res.row.id;
            q.base_versi = res.row.versi;
            q.isCreate = false;
          }
        }
        dropOp(op);
      } catch (e) {
        if (e.status === 409 || e.status === 400 || e.status === 403) {
          dropOp(op);
          toast(`Baris ${op.rowKode}: ${e.message}`, "error");
        } else {
          setSaveStatus(online ? "gagal" : "offline");
          setQueue(remaining);
          return;
        }
      }
    }
    const cellOps = ops.filter((o) => !o.isCreate && remaining.some((x) => x.op_id === o.op_id));
    if (useSocket) {
      for (const op of cellOps) {
        const cur = S.versionByKode.get(op.rowKode);
        try {
          const res = await sendCellOp(sock, {
            op_id: op.op_id,
            row_id: op.rowId || (cur && cur.id),
            col_key: op.serverColKey,
            value: op.value,
            base_versi: (cur && cur.versi) ?? op.base_versi,
          });
          if (res.ok && res.row) {
            S.versionByKode.set(op.rowKode, { id: res.row.id, versi: res.row.versi });
            dropOp(op);
          } else if (res.conflict) {
            dropOp(op);
            pushConflict(op, res.current);
          } else {
            setSaveStatus("gagal");
            toast(res.error || "Gagal menyimpan", "error");
            dropOp(op);
          }
        } catch (e) {
          if (e.message === "OFFLINE" || e.message === "TIMEOUT") {
            setSaveStatus("offline");
            setQueue(remaining);
            return;
          }
          setSaveStatus("gagal");
          dropOp(op);
        }
      }
    } else if (online) {
      // Fallback REST batch saat socket mati tapi internet ada.
      try {
        const batch = cellOps.map((o) => {
          const cur = S.versionByKode.get(o.rowKode);
          return {
            op_id: o.op_id,
            row_id: o.rowId || (cur && cur.id),
            col_key: o.serverColKey,
            value: o.value,
            base_versi: (cur && cur.versi) ?? o.base_versi,
          };
        }).filter((b) => b.row_id);
        if (batch.length) {
          const res = await api.collabBatch(batch);
          for (const out of res.results || []) {
            const op = cellOps.find((o) => o.op_id === out.op_id);
            if (!op) continue;
            if (out.saved) {
              S.versionByKode.set(op.rowKode, { id: out.row.id, versi: out.row.versi });
              dropOp(op);
            } else if (out.conflict) {
              dropOp(op);
              pushConflict(op, out.current);
            } else {
              toast(out.error || "Gagal menyimpan", "error");
              dropOp(op);
            }
          }
        }
      } catch (e) {
        setSaveStatus(e.network ? "offline" : "gagal");
        setQueue(remaining);
        return;
      }
    }
    setQueue(remaining);
    if (!remaining.length && !conflicts.length) {
      setSaveStatus("tersimpan");
      setLastSavedAt(new Date());
    } else if (remaining.length) {
      setSaveStatus("offline");
    }
  };

  // Bangun body baris penuh (semua kolom terpetakan) untuk create.
  const fullRowBody = (sheetIdx, rowKode) => {
    const cmap = colMapFor(sheetIdx);
    const sheet = getSheet(sheetIdx);
    if (!cmap || !sheet) return null;
    const row = (sheet.rows || []).find(
      (r) => String(r[cmap.kodeLocalKey] ?? "").trim() === rowKode
    );
    if (!row) return null;
    const body = {};
    for (const [localKey, serverKey] of cmap.localToServer) {
      const v = row[localKey];
      if (v === undefined || v === null || v === "") continue;
      if (typeof v === "string" && v.startsWith("=")) continue;
      body[serverKey] = v;
    }
    return body;
  };

  const pushConflict = (op, current) => {
    const sheet = getSheet(op.sheetIdx);
    const col = (sheet?.columns || []).find((c) => c.key === op.localColKey);
    setConflicts((prev) => {
      if (prev.some((c) => c.key === op.op_id)) return prev;
      return [
        ...prev,
        {
          key: op.op_id,
          rowKode: op.rowKode,
          sheetIdx: op.sheetIdx,
          colLabel: col ? col.label : op.serverColKey,
          serverColKey: op.serverColKey,
          localValue: op.value,
          current,
          byNama: (current && current.updated_by_nama) || "pengguna lain",
        },
      ];
    });
    setSaveStatus("gagal");
  };

  const resolveConflict = async (key, choice) => {
    const S = st.current;
    const c = conflicts.find((x) => x.key === key);
    if (!c) return;
    setConflicts((prev) => prev.filter((x) => x.key !== key));
    if (choice === "reload") {
      // Terima nilai server.
      if (c.current) applyServerCell(c.current, c.serverColKey, { silentClash: true });
      if (conflicts.length <= 1) {
        setSaveStatus(S.queue.length ? "menyimpan" : "tersimpan");
        if (S.queue.length) scheduleFlush();
      }
    } else {
      // Timpa dengan nilaiku memakai versi terbaru.
      const ver = S.versionByKode.get(c.rowKode);
      setQueue([
        ...S.queue,
        {
          op_id: `${Date.now().toString(36)}-rw`,
          sheetIdx: c.sheetIdx,
          sheetId: sheetIdOf(c.sheetIdx),
          rowKode: c.rowKode,
          rowId: ver ? ver.id : null,
          base_versi: c.current ? c.current.versi : ver ? ver.versi : null,
          localColKey: null,
          serverColKey: c.serverColKey,
          value: c.localValue,
          isCreate: false,
          overwrite: true,
        },
      ]);
      setSaveStatus("menyimpan");
      scheduleFlush();
    }
  };

  // ---------- terapkan perubahan remote ----------
  const findLocalRow = (sheetIdx, kode) => {
    const cmap = colMapFor(sheetIdx);
    const sheet = getSheet(sheetIdx);
    if (!cmap || !sheet) return -1;
    return (sheet.rows || []).findIndex(
      (r) => String(r[cmap.kodeLocalKey] ?? "").trim() === String(kode || "").trim()
    );
  };

  const sheetIdxById = (sheetId) => {
    const S = st.current;
    const total = sheetCount();
    for (let i = 0; i < total; i++) {
      const sheet = getSheet(i);
      if (!sheet) break;
      const sl = findSheetLink(S.sheetLinks, sheet.name, i, total);
      if (sl && Number(sl.sheetId) === Number(sheetId)) return i;
    }
    return -1;
  };

  const applyServerCell = (serverRow, serverColKey, opts = {}) => {
    const S = st.current;
    const idx = sheetIdxById(serverRow.sheet_id);
    if (idx < 0) return;
    const cmap = colMapFor(idx);
    if (!cmap) return;
    const localKey = cmap.serverToLocal.get(serverColKey);
    if (!localKey) return;
    const kode = String(serverRow.kode || "").trim();
    const ri = findLocalRow(idx, kode);
    if (ri < 0) {
      onRemoteRowCreated(serverRow, null);
      return;
    }
    S.versionByKode.set(kode, { id: serverRow.id, versi: serverRow.versi });
    S.idToKode.set(serverRow.id, kode);
    const val = serverColKey.startsWith("kimport")
      ? (serverRow.nilai && serverRow.nilai[serverColKey]) ?? ""
      : serverRow[serverColKey] ?? "";
    applySilent(idx, (s) => {
      const rows = [...s.rows];
      rows[ri] = { ...rows[ri], [localKey]: val };
      return { ...s, rows };
    });
    if (!opts.silentClash && activeCell && activeCell.sheetIdx === idx && activeCell.ri === ri && activeCell.localKey === localKey) {
      toast("Sel yang sedang diedit diubah pengguna lain — nilai diperbarui", "error");
    }
  };

  const onRemoteCell = (msg) => {
    if (!msg || !msg.row) return;
    applyServerCell(msg.row, msg.col_key);
    if (msg.by) setLastEdit({ byNama: msg.by.nama, at: new Date(), kode: msg.row.kode });
  };

  const onRemoteRowCreated = (serverRow, by) => {
    const S = st.current;
    if (!serverRow) return;
    const kode = String(serverRow.kode || "").trim();
    if (kode && S.versionByKode.has(kode)) return; // gema dari operasiku sendiri
    const idx = sheetIdxById(serverRow.sheet_id);
    if (idx < 0) return;
    const cmap = colMapFor(idx);
    if (!cmap) return;
    const sheet = getSheet(idx);
    const newRow = {};
    for (const c of sheet.columns || []) newRow[c.key] = "";
    for (const [serverKey, localKey] of cmap.serverToLocal) {
      newRow[localKey] = serverKey.startsWith("kimport")
        ? (serverRow.nilai && serverRow.nilai[serverKey]) ?? ""
        : serverRow[serverKey] ?? "";
    }
    applySilent(idx, (s) => ({ ...s, rows: [...s.rows, newRow] }));
    if (kode) {
      S.versionByKode.set(kode, { id: serverRow.id, versi: serverRow.versi });
      S.idToKode.set(serverRow.id, kode);
    }
    if (by) toast(`${by.nama} menambah baris ${kode || ""}`, undefined);
    setLastEdit({ byNama: by ? by.nama : "pengguna lain", at: new Date(), kode });
  };

  const onRemoteRowDeleted = (rowId, by) => {
    const S = st.current;
    const kode = S.idToKode.get(Number(rowId));
    if (!kode) return;
    for (let i = 0; i < 20; i++) {
      const ri = (() => {
        try {
          return findLocalRow(i, kode);
        } catch {
          return -1;
        }
      })();
      if (ri >= 0) {
        applySilent(i, (s) => ({ ...s, rows: s.rows.filter((_, j) => j !== ri) }));
        break;
      }
      if (!getSheet(i)) break;
    }
    S.versionByKode.delete(kode);
    S.idToKode.delete(Number(rowId));
    if (by) toast(`${by.nama} menghapus baris ${kode}`, undefined);
    setLastEdit({ byNama: by ? by.nama : "pengguna lain", at: new Date(), kode });
  };

  // ---------- kursor ----------
  const sendCursor = (sel) => {
    const S = st.current;
    if (!S.sock || !S.wbKey || !S.sock.connected) return;
    const now = Date.now();
    if (S.cursorTimer && now - S.cursorTimer < CURSOR_THROTTLE) return;
    S.cursorTimer = now;
    try {
      S.sock.emit("cursor", { workbook_key: S.wbKey, sel });
    } catch {
      /* abaikan */
    }
  };

  // ---------- share & revisi ----------
  const refreshShares = async () => {
    const S = st.current;
    if (!S.link) return;
    try {
      setShares(await api.collabShares(S.link.workbookKey));
    } catch (e) {
      toast(`Gagal memuat akses: ${e.message}`, "error");
    }
  };
  const refreshRevisions = async (sheetId) => {
    try {
      setRevisions(await api.collabRevisions(sheetId));
    } catch (e) {
      toast(`Gagal memuat revisi: ${e.message}`, "error");
    }
  };

  const resync = async () => {
    const S = st.current;
    if (!S.link) return;
    // Muat ulang peta versi; sel lokal yang tidak kotor mengikuti server.
    const dirty = new Set(S.queue.map((o) => `${o.rowKode}::${o.serverColKey}`));
    for (const sl of S.sheetLinks) {
      try {
        const res = await api.getSpreadsheetData(sl.sheetId);
        for (const r of res.data || []) {
          const kode = String(r.kode || "").trim();
          if (!kode) continue;
          S.versionByKode.set(kode, { id: r.id, versi: Number(r.versi) || 1 });
          S.idToKode.set(r.id, kode);
        }
        // Konvergensi sel bersih.
        const idx = sheetIdxById(sl.sheetId);
        if (idx >= 0) {
          const cmap = colMapFor(idx);
          if (cmap) {
            for (const r of res.data || []) {
              const kode = String(r.kode || "").trim();
              for (const [localKey, serverKey] of cmap.localToServer) {
                if (localKey === cmap.kodeLocalKey) continue;
                if (dirty.has(`${kode}::${serverKey}`)) continue;
                const ri = findLocalRow(idx, kode);
                if (ri < 0) continue;
                const sheet = getSheet(idx);
                const cur = sheet.rows[ri][localKey];
                const srv = serverKey.startsWith("kimport")
                  ? (r.nilai && r.nilai[serverKey]) ?? ""
                  : r[serverKey] ?? "";
                if (!sameVal(cur, srv)) {
                  const v = srv;
                  applySilent(idx, (s) => {
                    const rows = [...s.rows];
                    rows[ri] = { ...rows[ri], [localKey]: v };
                    return { ...s, rows };
                  });
                }
              }
            }
          }
        }
      } catch (e) {
        toast(`Gagal sinkronisasi: ${e.message}`, "error");
      }
    }
    toast("Sinkronisasi selesai", undefined);
  };

  const linked = !!(st.current.link || getCollabLink(activeFile?.id));
  const canWrite = !!(access && access.write);
  const activeSheetLink = (() => {
    const sheet = getSheet(activeSheetIdx);
    if (!sheet) return null;
    return findSheetLink(st.current.sheetLinks || [], sheet.name, activeSheetIdx, sheetCount()) || null;
  })();

  return {
    mode, access, users, saveStatus, pendingCount, conflicts, cursors,
    shares, revisions, lastSavedAt, linked, canWrite, workbookKey, activeSheetLink,
    lastEdit,
    connState: collabConnState(),
    onLocalRows, onRowsDeleted, resolveConflict, sendCursor,
    refreshShares, refreshRevisions, resync, flushQueue, relink,
    colorFor,
  };
}
