const { pool } = require("./db");

// Nilai bawaan bila Super Admin belum pernah menyimpan pengaturan.
const DEFAULTS = {
  session_ttl_days: 7,
  password_min_length: 6,
};

// Batas validasi agar nilai yang disimpan selalu masuk akal.
const LIMITS = {
  session_ttl_days: { min: 1, max: 90 },
  password_min_length: { min: 4, max: 32 },
};

const SKEYS = {
  session_ttl_days: "security_session_ttl_days",
  password_min_length: "security_password_min_length",
};

function clampInt(v, fallback, min, max) {
  const n = Number(v);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseStored(svalue, key) {
  if (svalue === null || svalue === undefined) return DEFAULTS[key];
  let v;
  try {
    v = typeof svalue === "string" ? JSON.parse(svalue) : svalue;
  } catch {
    return DEFAULTS[key];
  }
  const lim = LIMITS[key];
  return clampInt(v, DEFAULTS[key], lim.min, lim.max);
}

async function getSecuritySettings() {
  const out = { ...DEFAULTS };
  try {
    const [rows] = await pool.query(
      "SELECT skey, svalue FROM app_settings WHERE skey IN (?, ?)",
      [SKEYS.session_ttl_days, SKEYS.password_min_length]
    );
    for (const r of rows) {
      if (r.skey === SKEYS.session_ttl_days) {
        out.session_ttl_days = parseStored(r.svalue, "session_ttl_days");
      } else if (r.skey === SKEYS.password_min_length) {
        out.password_min_length = parseStored(r.svalue, "password_min_length");
      }
    }
  } catch {
    /* DB belum siap / tabel belum ada: pakai bawaan */
  }
  return out;
}

async function saveSecuritySettings({ session_ttl_days, password_min_length }) {
  const queries = [];
  if (session_ttl_days !== undefined) {
    const lim = LIMITS.session_ttl_days;
    queries.push([
      `INSERT INTO app_settings (skey, svalue) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE svalue = VALUES(svalue)`,
      [SKEYS.session_ttl_days, JSON.stringify(clampInt(session_ttl_days, DEFAULTS.session_ttl_days, lim.min, lim.max))],
    ]);
  }
  if (password_min_length !== undefined) {
    const lim = LIMITS.password_min_length;
    queries.push([
      `INSERT INTO app_settings (skey, svalue) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE svalue = VALUES(svalue)`,
      [SKEYS.password_min_length, JSON.stringify(clampInt(password_min_length, DEFAULTS.password_min_length, lim.min, lim.max))],
    ]);
  }
  for (const [sql, params] of queries) {
    await pool.query(sql, params);
  }
  return getSecuritySettings();
}

module.exports = { DEFAULTS, LIMITS, getSecuritySettings, saveSecuritySettings };
