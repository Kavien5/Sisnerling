# Plan: Editor Rumus Spreadsheet Statistik (khusus Super Admin)

## Goal
Menambahkan kemampuan mengganti rumus sel formula di halaman Spreadsheet Statistik:
- Endpoint baru: simpan rumus + preview validasi + riwayat backup (old formula & old hasil).
- Validasi dengan engine rumus SEBELUM simpan (dry-run): tolak rumus yang menghasilkan error baru.
- Transaksi MySQL + lock; rollback bila gagal — data input (`nilai`) tidak tersentuh.
- UI: klik sel formula → dialog ubah rumus (Modal), hanya muncul untuk `super_admin`.
- Backup hasil lama tersimpan di tabel riwayat + bisa dipulihkan dari dialog.

## File yang diubah

### 1. `server/schema.sql` — tabel riwayat (auto-migrasi)
Tambah setelah `statistical_module_state` (schema.sql dijalankan tiap boot via `db.js:33-35`, jadi `CREATE TABLE IF NOT EXISTS` cukup, tanpa langkah manual):

```sql
CREATE TABLE IF NOT EXISTS statistical_formula_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sheet_id INT NOT NULL,
  row_no INT NOT NULL,
  col_no INT NOT NULL,
  old_formula LONGTEXT NULL,
  new_formula LONGTEXT NULL,
  old_hasil JSON NULL,
  changed_by INT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_stat_hist_cell (sheet_id, row_no, col_no),
  CONSTRAINT fk_stat_hist_sheet FOREIGN KEY (sheet_id)
    REFERENCES statistical_sheets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2. `server/statisticalSpreadsheet.js` — endpoint & validasi

**a. `outputCell()` (baris 570-583):** sertakan `formula: cell.jenis === "formula" ? cell.formula : null` (seperti Excel, teks rumus terbaca bagi yang punya akses read; hanya UI super_admin yang menampilkan tombol edit).

**b. Helper `validateFormulaChange(db, sheet, cell, cells, sheets, newFormula, engine)`** (diekspor tidak perlu, cukup lokal):
1. Normalisasi: trim, buang prefix `=`, tolak kosong / >5000 karakter.
2. Tolak referensi eksternal: `isExternalFormula(newFormula)` (`/\[\d+\]/`) → 400.
3. `formulaDependencies()` pada salinan sel dengan rumus baru → menangkap rentang >20000 sel (throw → 400).
4. **Dry-run evaluasi**: bangun 2 versi state — `cellsLama` (apa adanya) & `cellsBaru` (copy dengan formula target diganti). Union target = kunci sel target ∪ dependen transitif dari kedua graph (`buildDependents` + `affectedFormulaKeys`).
5. `evaluateTargets(sheets, cellsBaru, engine, union)` → hasil baru per kunci.
6. Aturan tolak (semua → 400 dengan daftar `Sheet!Ref: error`):
   - Nilai baru sel target adalah error (`#NAME?`, `#REF!`, `#DIV/0!`, `#CYCLE!`, `#ERROR!`, `#VALUE!`).
   - Transisi baseline→baru: `hasil` tersimpan lama non-error tapi hasil baru error (lindungi nilai dependen yang selama ini valid).
   - Dependen terdampak ber-flag `formula_fallback=1` (kecuali target itu sendiri) → pesan "memerlukan sumber eksternal" (konsisten dengan `PUT /cells` baris 785-794).
7. Kembalikan `{ ok, newValue, affectedKeys, clearTargetFallback }`.

**c. Endpoint `PUT /api/statistical/formula`** (di dalam `createStatisticalRouter`, body: `{ sheet_id, row, col, formula, base_version, preview? }`):
1. `req.user.role !== "super_admin"` → 403.
2. `preview === true` → tanpa transaksi: load state (tanpa lock), jalankan `validateFormulaChange`, balas `{ ok: true, value, affectedCount }` / 400.
3. Simpan: `beginTransaction` → lock module (`SELECT ... FOR UPDATE`, pola baris 842) → `loadModuleState(lock=true)` → cek sel ada, `jenis === "formula"` (400), bukan `external_formula` (400), `base_version === cell.versi` (409).
4. `validateFormulaChange` → gagal: rollback + 400.
5. Backup: `INSERT statistical_formula_history (sheet_id, row_no, col_no, old_formula, new_formula, old_hasil, changed_by)`.
6. `UPDATE statistical_cells SET formula=?, formula_fallback = <0 jika target valid, else flag lama>, versi = versi + 1, updated_by=? WHERE ...`.
7. Mutasi `cell` di memori (`formula`, `formula_fallback`, `versi`), bangun ulang `buildDependents` dari seluruh sel modul (dengan rumus baru), `affected` = target ∪ transitif, lalu `recalculateAndSave(...)` (baris 585) — safety net: bila ada error tak terduga → 422 + rollback.
8. `logAudit({ action:"update", module:"statistical", description:"Ubah rumus <Sheet>!Ref", oldData:{formula, hasil}, newData:{formula}, req })` dari `server/auditLog.js` (gagal logging ditelan, di dalam transaksi boleh dipanggil setelah commit atau diabaikan).
9. Commit → balas `{ message, cell: { row, col, formula, value, version }, recalculated }`.

**d. Endpoint `GET /api/statistical/formula/history?sheet_id&row&col`** (super_admin): 5 entri terakhir dari `statistical_formula_history` (id, old_formula, new_formula, old_hasil, changed_at, nama user via join `users`) → dipakai dialog untuk tombol "Pulihkan" (restore = kirim PUT `/formula` biasa dengan rumus lama, lolos validasi yang sama).

### 3. `client/src/api.js` (setelah baris 228)
```js
statisticalUpdateFormula: (body) =>
  request("/api/statistical/formula", { method: "PUT", body: JSON.stringify(body) }),
statisticalFormulaHistory: (sheetId, row, col) =>
  request(`/api/statistical/formula/history?sheet_id=${sheetId}&row=${row}&col=${col}`),
```

### 4. `client/src/pages/StatisticalSpreadsheet.jsx` — UI
- Import `Modal` dari `../components/Modal.jsx` (komponen bersama, pola `ShareDialog`).
- State baru: `formulaEditor` (`{ key, row, col, ref, formula }` | null), `formulaDraft`, `formulaBusy`, `formulaPreview` (null | string), `formulaError`, `formulaHistory` (array).
- `cellsByKey` via `useMemo` dari `cells` untuk lookup saat render.
- **Pemicu klik** (hanya `canManage`):
  - Sel tahun ber-kind `formula` (render baris 647-650): bungkus content jadi `<button className="stat-formula-edit" title="Ubah rumus">` (badge ƒ tetap).
  - Sel tabel penunjang + kolom label: lookup `cellsByKey`; bila `kind === "formula"` → tombol sama.
- **Dialog `FormulaEditorDialog`** (dalam file ini, komponen kecil):
  - Header judul + lokasi `"{sheetMeta.name}!{cell.ref}"`.
  - Baris "Rumus saat ini" (read-only, monospace) + textarea draft (prefilled, monospace).
  - Tombol **Pratinjau** → `statisticalUpdateFormula({ ..., preview: true })` → tampilkan "Hasil: X" atau error validasi.
  - Riwayat (dimuat saat buka): 5 entri terakhir + tombol "Pulihkan" (isi ulang textarea dengan `old_formula`).
  - Footer (komponen `Modal`): `Batal` | `Simpan` (disabled saat busy / draft kosong / draft === rumus awal).
  - `Simpan` → `statisticalUpdateFormula({ sheet_id, row, col, formula: draft, base_version: cell.version })` → sukses: tutup dialog, `await loadSheet(sheetMeta.id)` (refresh penuh, efek bisa lintas-lembar), status "saved"; gagal: tampilkan pesan di dialog.
- Error global lama tetap dipakai untuk fallback.

### 5. `client/src/pages/StatisticalSpreadsheet.css`
- `.stat-formula-edit` — tombol sel: transparan, full-width, teks kiri, hover garis bawah, kursor pointer (konsisten dengan `.stat-page button` baris 68-90).
- Blok dialog: `.stat-formula-loc`, `.stat-formula-current` (mono, abu), `.stat-formula-input` (textarea mono, border radius var tema), `.stat-formula-preview` (sukses/hijau, error/merah), `.stat-formula-history` (list kecil), dukungan `.stat-dark`.
- Varian tema sudah tersedia: `--stat-formula` dipakai badge.

## Yang TIDAK dilakukan (di luar scope)
- Mengubah jenis sel (input↔static↔formula) — hanya sel ber-kind `formula` yang bisa diedit rumusnya.
- Fitur upload modul/template baru (tetap via `MODULES` + template .xlsx).
- Chart/grafik apa pun.

## Urutan implementasi
1. `schema.sql` (tabel riwayat)
2. Server: `outputCell` → helper validasi → `PUT /formula` → `GET /formula/history`
3. `api.js`
4. UI dialog + pemicu klik + CSS
5. Verifikasi

## Verifikasi
1. `npm run dev` (server boot → schema auto-migrasi, cek log tidak ada error `Unknown column` / `statistical_formula_history`).
2. Sebagai super_admin di halaman statistik:
   - Klik sel formula → dialog terbuka, rumus terprefill.
   - Pratinjau rumus valid (mis. `SUM(D10:D20)`) → tampil hasil.
   - Simpan → nilai sel & dependen berubah; cek DB: `statistical_cells.formula` baru, `versi` +1, baris di `statistical_formula_history`.
   - Pratinjau/simpan rumus rusak (`=ZZZ(D10)`, `=1/0`, referensi sheet tak dikenal) → ditolak 400, DB tidak berubah.
   - Pulihkan dari riwayat → rumus lama kembali + hasil lama terhitung ulang.
   - Edit satu angka input setelah ganti rumus → rumus baru ikut menghitung (dependen graph rebuild).
3. Sebagai user biasa: sel formula tetap read-only, tidak ada tombol edit; `PUT /formula` manual → 403.
4. Race: kirim `base_version` basi → 409.
5. Pastikan angka input (`statistical_cells.nilai`) tidak berubah sama sekali oleh semua skenario di atas.
