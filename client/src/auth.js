const TOKEN_KEY = "sisnerling_token";
const USER_KEY = "sisnerling_user";
export { TOKEN_KEY, USER_KEY };

export const ROLE_LABELS = {
  user: "User",
  admin: "Admin",
  super_admin: "Super Admin",
};

export function roleLabel(role) {
  return ROLE_LABELS[role] || "User";
}

// Apakah pengguna boleh melakukan aksi penulisan data (entry/edit).
export function canEditData(user) {
  return !!(user && (user.role === "admin" || user.role === "super_admin"));
}

// Apakah pengguna boleh mengubah struktur/konfigurasi (khusus Super Admin).
export function isSuperAdmin(user) {
  return !!(user && user.role === "super_admin");
}

// Apakah pengguna boleh beroperasi penuh saat maintenance.
export function hasMaintenanceBypass(user) {
  return isSuperAdmin(user);
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAuth(token, user) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

export function clearAuth() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

export function updateStoredUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}
