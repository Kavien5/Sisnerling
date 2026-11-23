function normalizeNip(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isValidNip(value) {
  return /^[0-9]{18}$/.test(normalizeNip(value));
}

function isNipDuplicateError(error) {
  if (!error || error.code !== "ER_DUP_ENTRY") return false;
  const message = `${error.message || ""} ${error.sqlMessage || ""}`;
  return message.includes("uq_users_nip");
}

module.exports = { normalizeNip, isValidNip, isNipDuplicateError };
