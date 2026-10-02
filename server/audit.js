const express = require("express");
const { pool } = require("./db");
const { requireRole } = require("./auth");
const { normalizeJson } = require("./auditLog");

const router = express.Router();

// Halaman Audit Log hanya diakses oleh Super Admin.
router.use(requireRole("super_admin"));

const MAX_PER_PAGE = 100;

// ===== Metadata untuk filter dropdown (user, action, module) =====
router.get("/meta", async (_req, res, next) => {
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
    });
  } catch (err) {
    next(err);
  }
});

// ===== Daftar log dengan filter + pagination =====
router.get("/logs", async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, parseInt(req.query.perPage) || 20));

    const where = [];
    const params = [];

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
              al.old_data, al.new_data, al.ip_address, al.user_agent, al.created_at,
              u.nama AS nama_user, u.email AS email_user, u.role AS role_user
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${whereSql}
       ORDER BY al.id DESC
       LIMIT ? OFFSET ?`,
      [...params, perPage, (page - 1) * perPage]
    );

    res.json({
      data: rows,
      total,
      page,
      perPage,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    });
  } catch (err) {
    next(err);
  }
});

// ===== Detail satu log (parsing old/new data) =====
router.get("/logs/:id", async (req, res, next) => {
  try {
    const [[row]] = await pool.query(
      `SELECT al.*, u.nama AS nama_user, u.email AS email_user, u.role AS role_user
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.id = ?`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: "Log tidak ditemukan" });
    row.old_data = normalizeJson(row.old_data);
    row.new_data = normalizeJson(row.new_data);
    res.json(row);
  } catch (err) {
    next(err);
  }
});

module.exports = { auditRouter: router };