const fs = require("fs");
const path = require("path");

// Salin hasil build Vite (client/dist) ke server/public agar server Express
// (npm start / npm run dev port 3000) selalu menyajikan bundle yang cocok
// dengan index.html. Mencegah layar putih akibat index.html menunjuk aset
// ber-hash yang sudah terhapus.

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "client", "dist");
const pub = path.join(root, "server", "public");
const assets = path.join(pub, "assets");

if (!fs.existsSync(dist)) {
  console.error("[sync-build] client/dist tidak ada. Jalankan build dahulu.");
  process.exit(1);
}

fs.mkdirSync(assets, { recursive: true });

if (!fs.existsSync(path.join(dist, "index.html"))) {
  console.error("[sync-build] client/dist/index.html tidak ada.");
  process.exit(1);
}

const newAssets = fs.existsSync(path.join(dist, "assets"))
  ? fs.readdirSync(path.join(dist, "assets"))
  : [];

for (const file of newAssets) {
  fs.copyFileSync(path.join(dist, "assets", file), path.join(assets, file));
}

for (const file of fs.readdirSync(assets)) {
  if (!newAssets.includes(file)) {
    fs.rmSync(path.join(assets, file), { force: true });
  }
}

fs.copyFileSync(path.join(dist, "index.html"), path.join(pub, "index.html"));

// Berkas statis di akar dist (mis. logo.svg / favicon) ikut disalin supaya
// favicon tetap tampil saat aplikasi disajikan dari server Express.
const rootFiles = fs
  .readdirSync(dist, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name !== "index.html")
  .map((entry) => entry.name);

for (const file of rootFiles) {
  fs.copyFileSync(path.join(dist, file), path.join(pub, file));
}

for (const entry of fs.readdirSync(pub, { withFileTypes: true })) {
  if (!entry.isFile() || entry.name === "index.html") continue;
  if (!rootFiles.includes(entry.name)) {
    fs.rmSync(path.join(pub, entry.name), { force: true });
  }
}

console.log(`[sync-build] server/public disinkronkan (${newAssets.length} aset, ${rootFiles.length} berkas statis).`);