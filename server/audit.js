const express = require("express");
const { pool } = require("./db");
const { requireRole } = require("./auth");
const { normalizeJson, logAudit } = require("./auditLog");

const router = express.Router();

// Autentikasi sudah diwajibkan oleh middleware /api di server.js. Jangan
// membatasi daftar ringkasan berdasarkan nama role: semua pengguna login dapat
// membacanya, sementara endpoint detail dan pengelolaan tetap khusus Super Admin.

const MAX_PER_PAGE = 100;
const RETENTION_HOURS = 72; // Kebijakan retensi 3 hari (72 jam)
const WARNING_HOURS = 24;   // Notifikasi jika log kedaluwarsa dlm 24 jam ke depan

// Helper: hitung sisa jam sebelum kedaluwarsa 72 jam
function calculateExpiresIn(createdAt, isArchived) {
  if (isArchived) return null; // Log yang diarsipkan tidak memiliki masa kedaluwarsa
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const remainingHours = (RETENTION_HOURS * 3600 * 1000 - ageMs) / (3600 * 1000);
  return Math.max(0, Math.round(remainingHours * 10) / 10);
}

// Helper: periksa apakah aksi dapat dipulihkan
function isActionRestorable(action, oldData, newData) {
  const restorableActions = ["edit", "update", "delete", "clean", "create", "restore", "pulihkan"];
  return restorableActions.includes(action) && (Boolean(oldData) || Boolean(newData));
}

// ===== Metadata untuk filter dropdown (user, action, module) & info retensi =====
router.get("/meta", requireRole("super_admin"), async (_req, res, next) => {
  try {
    const [users] = await pool.query(
      `SELECT u.id, u.nama, u.email, u.role FROM users u ORDER BY u.nama ASC`
    );
    const [actions] = await pool.query(
      `SELECT DISTINCT action FROM audit_logs ORDER BY action ASC`
    );
    const [modules] = await pool.query(
      `SELECT DISTINCT module FROM audit_logs ORDER BY module ASC`
    );
    res.json({
      users: users.map((u) => ({ id: u.id, nama: u.nama, email: u.email, role: u.role })),
      actions: actions.map((r) => r.action),
      modules: modules.map((r) => r.module),
      retentionPolicy: {
        retentionHours: RETENTION_HOURS,
        warningHours: WARNING_HOURS,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ===== Status Retensi & Peringatan Kedaluwarsa =====
router.get("/retention-status", requireRole("super_admin"), async (_req, res, next) => {
  try {
    // Total aktif (belum diarsipkan)
    const [[{ total_active }]] = await pool.query(
      "SELECT COUNT(*) AS total_active FROM audit_logs WHERE is_archived = 0"
    );

    // Total diarsipkan / disimpan
    const [[{ total_archived }]] = await pool.query(
      "SELECT COUNT(*) AS total_archived FROM audit_logs WHERE is_archived = 1"
    );

    // Log yang akan kedaluwarsa dalam 24 jam ke depan (dibuat antara 48 jam s/d 72 jam lalu)
    const [[{ expiring_soon }]] = await pool.query(
      `SELECT COUNT(*) AS expiring_soon FROM audit_logs
       WHERE is_archived = 0
         AND created_at <= DATE_SUB(NOW(), INTERVAL ? HOUR)
         AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)`,
      [RETENTION_HOURS - WARNING_HOURS, RETENTION_HOURS]
    );

    // Log aktif yang sudah melewati batas 72 jam (menunggu siklus pembersihan)
    const [[{ expired_pending }]] = await pool.query(
      `SELECT COUNT(*) AS expired_pending FROM audit_logs
       WHERE is_archived = 0 AND created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)`,
      [RETENTION_HOURS]
    );

    // Total snapshot pemulihan di tabel terpisah
    const [[{ total_snapshots }]] = await pool.query(
      "SELECT COUNT(*) AS total_snapshots FROM audit_restore_snapshots"
    );

    res.json({
      retention_hours: RETENTION_HOURS,
      warning_hours: WARNING_HOURS,
      total_active: Number(total_active) || 0,
      total_archived: Number(total_archived) || 0,
      expiring_soon: Number(expiring_soon) || 0,
      expired_pending: Number(expired_pending) || 0,
      total_snapshots: Number(total_snapshots) || 0,
    });
  } catch (err) {
    next(err);
  }
});

// ===== Daftar log dengan filter + scope (aktif/arsip) + pagination =====
router.get("/logs", async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, parseInt(req.query.perPage) || 20));

    const where = [];
    const params = [];

    // Scope: active (default, 72 jam), archived (disimpan), atau all
    const scope = (req.query.scope || "active").toLowerCase();
    if (scope === "active") {
      where.push("al.is_archived = 0");
    } else if (scope === "archived") {
      where.push("al.is_archived = 1");
    }

    if (req.query.userId) {
      where.push("al.user_id = ?");
      params.push(req.query.userId);
    }
    if (req.query.action) {
      where.push("al.action = ?");
      params.push(req.query.action);
    }
    if (req.query.module) {
      where.push("al.module = ?");
      params.push(req.query.module);
    }
    if (req.query.from) {
      where.push("al.created_at >= ?");
      params.push(String(req.query.from).slice(0, 10) + " 00:00:00");
    }
    if (req.query.to) {
      where.push("al.created_at <= ?");
      params.push(String(req.query.to).slice(0, 10) + " 23:59:59");
    }
    const q = (req.query.q || "").trim();
    if (q) {
      where.push("(al.description LIKE ? OR al.module LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM audit_logs al ${whereSql}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT al.id, al.user_id, al.action, al.description, al.module, al.record_id,
<<<<<<< HEAD
              al.old_data, al.new_data, al.ip_address, al.user_agent, al.created_at, al.is_saved,
              DATE_ADD(al.created_at, INTERVAL 3 DAY) AS expires_at,
              u.nama AS nama_user, u.email AS email_user, u.role AS role_user
=======
              al.old_data, al.new_data, al.ip_address, al.user_agent,
              al.is_archived, al.archived_at, al.archived_by,
              al.restored_at, al.restored_by, al.source_log_id, al.created_at,
              u.nama AS nama_user, u.email AS email_user, u.role AS role_user,
              ur.nama AS nama_restorer, ua.nama AS nama_archiver
>>>>>>> 1f7ba671be2dbad36d5988aecd9014a3e13cc3da
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       LEFT JOIN users ur ON ur.id = al.restored_by
       LEFT JOIN users ua ON ua.id = al.archived_by
       ${whereSql}
       ORDER BY al.id DESC
       LIMIT ? OFFSET ?`,
      [...params, perPage, (page - 1) * perPage]
    );

    const isSuperAdmin = req.user.role === "super_admin";
    const processedRows = rows.map((r) => {
      const oldD = normalizeJson(r.old_data);
      const newD = normalizeJson(r.new_data);
      if (!isSuperAdmin) {
        return {
          id: r.id,
          action: r.action,
          description: r.description,
          module: r.module,
          created_at: r.created_at,
          nama_user: r.nama_user,
          role_user: r.role_user,
        };
      }
      const expiresIn = calculateExpiresIn(r.created_at, r.is_archived);
      return {
        ...r,
        old_data: oldD,
        new_data: newD,
        is_archived: Boolean(r.is_archived),
        expires_in_hours: expiresIn,
        is_expiring_soon: expiresIn !== null && expiresIn <= WARNING_HOURS,
        is_expired: expiresIn !== null && expiresIn === 0,
        can_restore: isActionRestorable(r.action, oldD, newD),
        is_restored: Boolean(r.restored_at),
      };
    });

    res.json({
      data: processedRows,
      total,
      page,
      perPage,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
      scope,
    });
  } catch (err) {
    next(err);
  }
});

<<<<<<< HEAD
router.put("/logs/:id/saved", async (req, res, next) => {
  try {
    if (!/^\d+$/.test(String(req.params.id)) || Number(req.params.id) < 1) {
      return res.status(400).json({ error: "ID log tidak valid" });
    }
    if (!req.body || typeof req.body.isSaved !== "boolean") {
      return res.status(400).json({ error: "Status simpan harus berupa boolean" });
    }
    const [result] = await pool.query(
      "UPDATE audit_logs SET is_saved = ? WHERE id = ?",
      [req.body.isSaved ? 1 : 0, req.params.id]
    );
    if (result.affectedRows === 0) {
      const [[row]] = await pool.query("SELECT id FROM audit_logs WHERE id = ?", [req.params.id]);
      if (!row) return res.status(404).json({ error: "Log tidak ditemukan" });
    }
    res.json({ id: Number(req.params.id), is_saved: req.body.isSaved });
  } catch (err) {
    next(err);
  }
});

router.delete("/logs/:id", async (req, res, next) => {
  try {
    if (!/^\d+$/.test(String(req.params.id)) || Number(req.params.id) < 1) {
      return res.status(400).json({ error: "ID log tidak valid" });
    }
    const [result] = await pool.query("DELETE FROM audit_logs WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Log tidak ditemukan" });
    }
    res.json({ id: Number(req.params.id), message: "Log audit berhasil dihapus" });
  } catch (err) {
    next(err);
  }
});

// ===== Detail satu log (parsing old/new data) =====
router.get("/logs/:id", async (req, res, next) => {
=======
// ===== Detail satu log =====
router.get("/logs/:id", requireRole("super_admin"), async (req, res, next) => {
>>>>>>> 1f7ba671be2dbad36d5988aecd9014a3e13cc3da
  try {
    const [[row]] = await pool.query(
      `SELECT al.*, u.nama AS nama_user, u.email AS email_user, u.role AS role_user,
              ur.nama AS nama_restorer, ua.nama AS nama_archiver
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       LEFT JOIN users ur ON ur.id = al.restored_by
       LEFT JOIN users ua ON ua.id = al.archived_by
       WHERE al.id = ?`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: "Log tidak ditemukan" });
    row.old_data = normalizeJson(row.old_data);
    row.new_data = normalizeJson(row.new_data);
    row.is_archived = Boolean(row.is_archived);
    row.expires_in_hours = calculateExpiresIn(row.created_at, row.is_archived);
    row.is_expiring_soon = row.expires_in_hours !== null && row.expires_in_hours <= WARNING_HOURS;
    row.can_restore = isActionRestorable(row.action, row.old_data, row.new_data);
    row.is_restored = Boolean(row.restored_at);
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// ===== Simpan Riwayat (Arsipkan satu log) =====
router.post("/logs/:id/archive", requireRole("super_admin"), async (req, res, next) => {
  try {
    const logId = Number(req.params.id);
    const [[log]] = await pool.query("SELECT * FROM audit_logs WHERE id = ?", [logId]);
    if (!log) return res.status(404).json({ error: "Log tidak ditemukan" });

    await pool.query(
      "UPDATE audit_logs SET is_archived = 1, archived_at = NOW(), archived_by = ? WHERE id = ?",
      [req.user.id, logId]
    );

    res.json({ message: "Riwayat aktivitas berhasil disimpan/diarsipkan", id: logId });
  } catch (err) {
    next(err);
  }
});

// ===== Kembalikan ke Riwayat Aktif (Batal Arsip) =====
router.post("/logs/:id/unarchive", requireRole("super_admin"), async (req, res, next) => {
  try {
    const logId = Number(req.params.id);
    const [[log]] = await pool.query("SELECT * FROM audit_logs WHERE id = ?", [logId]);
    if (!log) return res.status(404).json({ error: "Log tidak ditemukan" });

    await pool.query(
      "UPDATE audit_logs SET is_archived = 0, archived_at = NULL, archived_by = NULL WHERE id = ?",
      [logId]
    );

    res.json({ message: "Riwayat dikembalikan ke tampilan riwayat aktif", id: logId });
  } catch (err) {
    next(err);
  }
});

// ===== Arsipkan Sekaligus (Batch Archive) =====
router.post("/logs/batch-archive", requireRole("super_admin"), async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: "Pilih setidaknya satu riwayat untuk diarsipkan" });

    const [r] = await pool.query(
      "UPDATE audit_logs SET is_archived = 1, archived_at = NOW(), archived_by = ? WHERE id IN (?)",
      [req.user.id, ids]
    );

    res.json({ message: `${r.affectedRows} riwayat berhasil disimpan/diarsipkan`, count: r.affectedRows });
  } catch (err) {
    next(err);
  }
});

// ===== Arsipkan Semua Riwayat yang Akan Kedaluwarsa (<24 jam) =====
router.post("/archive-expiring", requireRole("super_admin"), async (req, res, next) => {
  try {
    const [r] = await pool.query(
      `UPDATE audit_logs SET is_archived = 1, archived_at = NOW(), archived_by = ?
       WHERE is_archived = 0 AND created_at <= DATE_SUB(NOW(), INTERVAL ? HOUR)`,
      [req.user.id, RETENTION_HOURS - WARNING_HOURS]
    );

    res.json({
      message: `${r.affectedRows} riwayat yang mendekati batas waktu berhasil disimpan`,
      count: r.affectedRows,
    });
  } catch (err) {
    next(err);
  }
});

// ===== Pembersihan Log Kedaluwarsa Otomatis / Manual (> 72 jam) =====
// PENTING: Sesuai spesifikasi, tabel `audit_restore_snapshots` TIDAK DIHAPUS
// sehingga data pemulihan tetap utuh selamanya.
async function purgeExpiredAuditLogs() {
  try {
    const [r] = await pool.query(
      `DELETE FROM audit_logs
       WHERE is_archived = 0 AND created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)`,
      [RETENTION_HOURS]
    );
    if (r.affectedRows > 0) {
      console.log(`[AUDIT RETENTION] ${r.affectedRows} log aktif kedaluwarsa (> 72 jam) telah dibersihkan.`);
    }
    return r.affectedRows;
  } catch (err) {
    console.error("[AUDIT RETENTION] Gagal membersihkan log kedaluwarsa:", err && err.message ? err.message : err);
    return 0;
  }
}

router.post("/cleanup-expired", requireRole("super_admin"), async (_req, res, next) => {
  try {
    const deleted = await purgeExpiredAuditLogs();
    res.json({ message: `Pembersihan selesai. ${deleted} log kedaluwarsa dibersihkan.`, deleted });
  } catch (err) {
    next(err);
  }
});

// ===== Pratinjau Restore (3 Kolom: Field | Nilai Saat Ini | Nilai Setelah Restore + Deteksi Konflik) =====
router.get("/logs/:id/restore-preview", requireRole("super_admin"), async (req, res, next) => {
  try {
    const logId = Number(req.params.id);
    const [[log]] = await pool.query(
      `SELECT al.*, u.nama AS nama_user, u.email AS email_user
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.id = ?`,
      [logId]
    );
    if (!log) return res.status(404).json({ error: "Log tidak ditemukan" });

    const oldData = normalizeJson(log.old_data) || {};
    const newData = normalizeJson(log.new_data) || {};

    const diffRows = [];
    let hasConflict = false;
    let conflictReason = null;
    let targetSummary = "";
    let canRestore = true;

    // --- Kasus 1: Modul Data (data_barang) ---
    if (log.module === "data" || log.record_id && (log.action === "edit" || log.action === "update" || log.action === "delete" || log.action === "create")) {
      const recordId = log.record_id;
      if (log.action === "edit" || log.action === "update") {
        const [[curr]] = await pool.query("SELECT * FROM data_barang WHERE id = ?", [recordId]);
        targetSummary = `Baris data barang / neraca #${recordId} (${oldData.nama || newData.nama || "-"})`;

        if (!curr) {
          canRestore = false;
          conflictReason = "Data asli sudah dihapus di database saat ini, tidak dapat dipulihkan secara langsung.";
        } else {
          // Bandingkan field-field data_barang
          const fields = ["kode", "nama", "kategori_id", "jumlah", "harga", "tanggal", "status", "keterangan"];
          for (const f of fields) {
            const currentVal = curr[f] !== undefined ? curr[f] : null;
            const targetVal = oldData[f] !== undefined ? oldData[f] : currentVal;
            const expectedAfterAction = newData[f] !== undefined ? newData[f] : null;

            // Konflik jika nilai di database saat ini sudah berbeda dari yang dihasilkan oleh aksi log ini
            let fieldConflict = false;
            if (expectedAfterAction !== null && String(currentVal) !== String(expectedAfterAction)) {
              fieldConflict = true;
              hasConflict = true;
            }

            diffRows.push({
              field: f,
              current: currentVal,
              restore: targetVal,
              conflict: fieldConflict,
              changed: String(currentVal) !== String(targetVal),
            });
          }
          if (hasConflict) {
            conflictReason = "Data telah dimodifikasi oleh pengguna/aktivitas lain setelah log ini tercatat.";
          }
        }
      } else if (log.action === "delete") {
        targetSummary = `Pemulihan data yang terhapus: "${oldData.nama || "-"}" (${oldData.kode || "-"})`;
        const [[curr]] = await pool.query("SELECT id FROM data_barang WHERE id = ? OR (kode = ? AND kode != '')", [recordId, oldData.kode || ""]);
        if (curr) {
          hasConflict = true;
          conflictReason = "Data dengan ID atau kode barang yang sama sudah ada kembali di database.";
        }
        for (const [k, v] of Object.entries(oldData)) {
          if (["id", "kode", "nama", "kategori_id", "jumlah", "harga", "tanggal", "status", "keterangan"].includes(k)) {
            diffRows.push({
              field: k,
              current: "(Terhapus / Tidak Ada)",
              restore: v,
              conflict: false,
              changed: true,
            });
          }
        }
      } else if (log.action === "create") {
        targetSummary = `Pembatalan penambahan data #${recordId} (Akan dihapus kembali)`;
        const [[curr]] = await pool.query("SELECT * FROM data_barang WHERE id = ?", [recordId]);
        if (!curr) {
          canRestore = false;
          conflictReason = "Data yang dibuat sudah tidak ada lagi di database.";
        } else {
          diffRows.push({
            field: "Status Data",
            current: "Ada di database",
            restore: "(Dihapus / Dikembalikan ke sebelum ditambah)",
            conflict: false,
            changed: true,
          });
        }
      }
    }
    // --- Kasus 2: Modul Statistik (Spreadsheet) ---
    else if (log.module === "statistical") {
      const sheetId = oldData.sheet_id || newData.sheet_id || log.record_id;
      const rowNo = oldData.row || newData.row;
      const colNo = oldData.col || newData.col;
      const cellRef = oldData.cellRef || newData.cellRef || `Baris ${rowNo}, Kolom ${colNo}`;
      targetSummary = `Sel lembar kerja statistik ${oldData.sheet_nama || ""}!${cellRef}`;

      if (sheetId && rowNo && colNo) {
        const [[currCell]] = await pool.query(
          "SELECT * FROM statistical_cells WHERE sheet_id = ? AND row_no = ? AND col_no = ?",
          [sheetId, rowNo, colNo]
        );
        if (!currCell) {
          canRestore = false;
          conflictReason = "Sel statistik tidak ditemukan di database.";
        } else {
          const currentVal = currCell.nilai ? (typeof currCell.nilai === "string" ? JSON.parse(currCell.nilai) : currCell.nilai) : null;
          const restoreVal = oldData.nilai !== undefined ? oldData.nilai : null;
          const expectedVal = newData.nilai !== undefined ? newData.nilai : null;

          if (expectedVal !== null && String(currentVal) !== String(expectedVal)) {
            hasConflict = true;
            conflictReason = "Nilai sel telah diubah oleh operasi lain setelah log ini tercatat.";
          }

          diffRows.push({
            field: `Nilai ${cellRef}`,
            current: currentVal,
            restore: restoreVal,
            conflict: hasConflict,
            changed: String(currentVal) !== String(restoreVal),
          });
        }
      } else if (oldData.formula !== undefined) {
        // Formula edit restore
        diffRows.push({
          field: "Rumus Formula",
          current: "(Rumus Saat Ini)",
          restore: oldData.formula,
          conflict: false,
          changed: true,
        });
      }
    }
    // --- Kasus 3: Modul Kategori ---
    else if (log.module === "kategori") {
      targetSummary = `Kategori #${log.record_id} (${oldData.nama_kategori || newData.nama_kategori || "-"})`;
      const [[currKat]] = await pool.query("SELECT * FROM kategori WHERE id = ?", [log.record_id]);
      if (!currKat && log.action !== "delete") {
        canRestore = false;
        conflictReason = "Kategori sudah dihapus di database.";
      } else {
        const fields = ["nama_kategori", "deskripsi", "icon"];
        for (const f of fields) {
          const currentVal = currKat ? currKat[f] : "(Terhapus)";
          const restoreVal = oldData[f] !== undefined ? oldData[f] : currentVal;
          diffRows.push({
            field: f,
            current: currentVal,
            restore: restoreVal,
            conflict: false,
            changed: String(currentVal) !== String(restoreVal),
          });
        }
      }
    }
    // --- Kasus Umum / Fallback ---
    else {
      targetSummary = `Objek modul ${log.module} #${log.record_id || log.id}`;
      const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
      allKeys.forEach((k) => {
        diffRows.push({
          field: k,
          current: newData[k] !== undefined ? newData[k] : "–",
          restore: oldData[k] !== undefined ? oldData[k] : "–",
          conflict: false,
          changed: String(oldData[k]) !== String(newData[k]),
        });
      });
    }

    res.json({
      log_id: log.id,
      action: log.action,
      module: log.module,
      target_summary: targetSummary,
      performed_by: log.nama_user || "Akun terhapus",
      performed_at: log.created_at,
      description: log.description,
      can_restore: canRestore && diffRows.length > 0,
      has_conflict: hasConflict,
      conflict_reason: conflictReason,
      diff: diffRows,
    });
  } catch (err) {
    next(err);
  }
});

// ===== Eksekusi Restore (Undo / Pemulihan Data Nyata ke Database) =====
router.post("/logs/:id/restore", requireRole("super_admin"), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const logId = Number(req.params.id);
    const [[log]] = await connection.query("SELECT * FROM audit_logs WHERE id = ? FOR UPDATE", [logId]);
    if (!log) {
      connection.release();
      return res.status(404).json({ error: "Log tidak ditemukan" });
    }

    const oldData = normalizeJson(log.old_data);
    const newData = normalizeJson(log.new_data);

    if (!oldData && !newData) {
      connection.release();
      return res.status(400).json({ error: "Tidak ada data riwayat yang dapat dipulihkan dari log ini." });
    }

    await connection.beginTransaction();

    let restoredDescription = "";
    let targetType = log.module;
    let targetId = log.record_id;
    let preRestoreState = null;
    let postRestoreState = null;

    // 1. Restore data_barang (edit/update, delete, atau undo-create)
    if (log.module === "data" || (log.record_id && (log.action === "edit" || log.action === "update" || log.action === "delete" || log.action === "create"))) {
      targetType = "data_barang";
      targetId = log.record_id;

      if (log.action === "edit" || log.action === "update") {
        const [[cur]] = await connection.query("SELECT * FROM data_barang WHERE id = ? FOR UPDATE", [log.record_id]);
        if (!cur) {
          throw new Error("Data asli di tabel data_barang tidak ditemukan (sudah terhapus).");
        }
        preRestoreState = cur;

        const formulasJson = oldData.formulas ? (typeof oldData.formulas === "string" ? oldData.formulas : JSON.stringify(oldData.formulas)) : null;
        const nilaiJson = oldData.nilai ? (typeof oldData.nilai === "string" ? oldData.nilai : JSON.stringify(oldData.nilai)) : null;

        await connection.query(
          `UPDATE data_barang SET
             kode = ?, nama = ?, kategori_id = ?, jumlah = ?, harga = ?,
             tanggal = ?, status = ?, keterangan = ?, formulas = ?, nilai = ?,
             versi = versi + 1, updated_by = ?
           WHERE id = ?`,
          [
            oldData.kode !== undefined ? oldData.kode : cur.kode,
            oldData.nama !== undefined ? oldData.nama : cur.nama,
            oldData.kategori_id !== undefined ? oldData.kategori_id : cur.kategori_id,
            oldData.jumlah !== undefined ? Number(oldData.jumlah) : cur.jumlah,
            oldData.harga !== undefined ? Number(oldData.harga) : cur.harga,
            oldData.tanggal ? String(oldData.tanggal).slice(0, 10) : cur.tanggal,
            oldData.status || cur.status,
            oldData.keterangan !== undefined ? oldData.keterangan : cur.keterangan,
            formulasJson,
            nilaiJson,
            req.user.id,
            log.record_id,
          ]
        );
        postRestoreState = oldData;
        restoredDescription = `Memulihkan perubahan data barang "${oldData.nama || cur.nama}" (#${log.record_id}) ke kondisi sebelum aktivitas #${log.id}`;
      } else if (log.action === "delete") {
        // Pulihkan baris yang terhapus
        const formulasJson = oldData.formulas ? (typeof oldData.formulas === "string" ? oldData.formulas : JSON.stringify(oldData.formulas)) : null;
        const nilaiJson = oldData.nilai ? (typeof oldData.nilai === "string" ? oldData.nilai : JSON.stringify(oldData.nilai)) : null;

        await connection.query(
          `INSERT INTO data_barang (id, kode, nama, kategori_id, sub_kategori_id, sheet_id, jumlah, harga, tanggal, status, keterangan, formulas, nilai, versi, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
           ON DUPLICATE KEY UPDATE
             nama = VALUES(nama), jumlah = VALUES(jumlah), harga = VALUES(harga), status = VALUES(status), updated_by = VALUES(updated_by)`,
          [
            oldData.id || log.record_id || null,
            oldData.kode || `RESTORE-${Date.now()}`,
            oldData.nama || "Data Dipulihkan",
            oldData.kategori_id || null,
            oldData.sub_kategori_id || null,
            oldData.sheet_id || null,
            oldData.jumlah || 0,
            oldData.harga || 0,
            oldData.tanggal ? String(oldData.tanggal).slice(0, 10) : new Date().toISOString().slice(0, 10),
            oldData.status || "Aktif",
            oldData.keterangan || null,
            formulasJson,
            nilaiJson,
            req.user.id,
          ]
        );
        postRestoreState = oldData;
        restoredDescription = `Mengembalikan data yang dihapus "${oldData.nama || "-"}" dari log #${log.id}`;
      } else if (log.action === "create") {
        // Undo create = hapus record yang sempat ditambah
        const [[cur]] = await connection.query("SELECT * FROM data_barang WHERE id = ?", [log.record_id]);
        preRestoreState = cur;
        await connection.query("DELETE FROM data_barang WHERE id = ?", [log.record_id]);
        restoredDescription = `Membatalkan penambahan data #${log.record_id} dari log #${log.id}`;
      }
    }
    // 2. Restore Spreadsheet Statistik
    else if (log.module === "statistical") {
      targetType = "statistical_cells";
      const sheetId = oldData?.sheet_id || newData?.sheet_id || log.record_id;
      const rowNo = oldData?.row || newData?.row;
      const colNo = oldData?.col || newData?.col;

      if (sheetId && rowNo && colNo && oldData.nilai !== undefined) {
        const [[currCell]] = await connection.query(
          "SELECT * FROM statistical_cells WHERE sheet_id = ? AND row_no = ? AND col_no = ? FOR UPDATE",
          [sheetId, rowNo, colNo]
        );
        preRestoreState = currCell;
        const restoreVal = oldData.nilai !== null ? JSON.stringify(oldData.nilai) : null;
        await connection.query(
          "UPDATE statistical_cells SET nilai = ?, versi = versi + 1, updated_by = ? WHERE sheet_id = ? AND row_no = ? AND col_no = ?",
          [restoreVal, req.user.id, sheetId, rowNo, colNo]
        );
        postRestoreState = { sheet_id: sheetId, row: rowNo, col: colNo, nilai: oldData.nilai };
        restoredDescription = `Memulihkan nilai sel statistik (${oldData.cellRef || `R${rowNo}C${colNo}`}) ke nilai ${oldData.nilai ?? "(kosong)"}`;
      } else if (oldData?.formula) {
        await connection.query(
          "UPDATE statistical_cells SET formula = ?, formula_fallback = 0, versi = versi + 1, updated_by = ? WHERE sheet_id = ? AND row_no = ? AND col_no = ?",
          [oldData.formula, req.user.id, sheetId, rowNo, colNo]
        );
        restoredDescription = `Memulihkan formula sel statistik ke "${oldData.formula}"`;
      }
    }
    // 3. Restore Kategori
    else if (log.module === "kategori") {
      targetType = "kategori";
      targetId = log.record_id;
      if (log.action === "update" && oldData) {
        await connection.query(
          "UPDATE kategori SET nama_kategori = ?, deskripsi = ?, icon = ? WHERE id = ?",
          [oldData.nama_kategori, oldData.deskripsi || null, oldData.icon || null, log.record_id]
        );
        restoredDescription = `Memulihkan kategori "${oldData.nama_kategori}" ke kondisi sebelum log #${log.id}`;
      } else if (log.action === "delete" && oldData) {
        await connection.query(
          "INSERT INTO kategori (id, nama_kategori, deskripsi, icon) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE nama_kategori = VALUES(nama_kategori)",
          [log.record_id, oldData.nama_kategori, oldData.deskripsi || null, oldData.icon || null]
        );
        restoredDescription = `Mengembalikan kategori "${oldData.nama_kategori}" yang terhapus dari log #${log.id}`;
      }
    }
    // 4. Undoing a Previous Restore (Redo capability)
    else if (log.action === "restore") {
      // Restore dari log bertipe restore = mengembalikan ke kondisi old_data log restore
      restoredDescription = `Membatalkan pemulihan sebelumnya (Redo) dari log #${log.id}`;
    } else {
      throw new Error(`Modul "${log.module}" dengan aksi "${log.action}" belum mendukung pemulihan otomatis.`);
    }

    // Tandai log sumber bahwa ia telah dipulihkan
    await connection.query(
      "UPDATE audit_logs SET restored_at = NOW(), restored_by = ? WHERE id = ?",
      [req.user.id, log.id]
    );

    await connection.commit();

    // Catat tindakan restore sebagai audit log baru yang dapat ditelusuri
    logAudit({
      userId: req.user.id,
      action: "restore",
      module: log.module,
      description: restoredDescription || `Memulihkan data dari log #${log.id}`,
      recordId: targetId,
      oldData: preRestoreState || newData,
      newData: postRestoreState || oldData,
      req,
    });

    res.json({
      message: "Data berhasil dipulihkan ke kondisi sebelumnya!",
      log_id: log.id,
      description: restoredDescription,
    });
  } catch (err) {
    try {
      await connection.rollback();
    } catch { /* abaikan */ }
    next(err);
  } finally {
    connection.release();
  }
});

// Inisialisasi scheduler retensi di backend (membersihkan log > 72 jam secara periodik setiap 1 jam)
function startAuditRetentionScheduler() {
  // Jalankan sekali saat startup
  purgeExpiredAuditLogs();

  // Jadwalkan setiap 1 jam (3600000 ms)
  const timer = setInterval(() => {
    purgeExpiredAuditLogs();
  }, 60 * 60 * 1000);

  if (timer.unref) timer.unref(); // Jangan menahan proses node agar bisa shutdown bersih
}

// Mulai scheduler retensi otomatis
startAuditRetentionScheduler();

module.exports = { auditRouter: router, purgeExpiredAuditLogs };