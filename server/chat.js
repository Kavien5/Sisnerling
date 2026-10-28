const express = require("express");
const { pool } = require("./db");

function createChatRouter() {
  const router = express.Router();

  router.get("/messages", async (req, res, next) => {
    try {
      const [messages] = await pool.query(
        `SELECT m.id, m.sender_id, u.nama AS sender_name,
                u.role AS sender_role, m.message, m.created_at
         FROM chat_messages m
         JOIN users u ON u.id = m.sender_id
         ORDER BY m.id DESC
         LIMIT 100`
      );
      res.json({ messages: messages.reverse() });
    } catch (err) {
      next(err);
    }
  });

  router.post("/messages", async (req, res, next) => {
    try {
      const message = String((req.body && req.body.message) || "").trim();
      if (!message) return res.status(400).json({ error: "Pesan tidak boleh kosong" });
      if (message.length > 2000) {
        return res.status(400).json({ error: "Pesan maksimal 2.000 karakter" });
      }

      const [result] = await pool.query(
        "INSERT INTO chat_messages (conversation_user_id, sender_id, message) VALUES (NULL, ?, ?)",
        [req.user.id, message]
      );
      const [[savedMessage]] = await pool.query(
        `SELECT m.id, m.sender_id, u.nama AS sender_name,
                u.role AS sender_role, m.message, m.created_at
         FROM chat_messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.id = ?`,
        [result.insertId]
      );
      res.status(201).json({ message: savedMessage });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createChatRouter };
