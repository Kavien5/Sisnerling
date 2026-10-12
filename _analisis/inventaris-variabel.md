# Inventaris Variabel Excel -> Database Website (Tahap Identifikasi)

Tanggal: 2026-10-12
Tujuan: identifikasi awal **seluruh variabel** agar bisa di-store di database website. Bukan migrasi rumus mentah, tapi pemetaan: mana yang jadi **input form**, mana yang jadi **kolom hitung otomatis (generated)**.

## 1. File yang diinventarisasi (hanya 2 file ini)

| # | Nama File (pendek) | Path penuh | Jumlah Sheet | Dimensi utama |
|---|---|---|---|---|
| F1 | `synthetic-bond.xlsx` | `C:\laragon\www\sisnerling\Sisnerling\_analisis\synthetic-bond.xlsx` | 1 | `Bond` A1:W8 |
| F2 | `original-7502adecb7ad.xlsx` | `C:\laragon\www\sisnerling\Sisnerling\server\storage\workbooks\WB_001\original-7502adecb7ad.xlsx` | 12 | READ ME, PDB ADHB, Penyusutan, SUT (Rasio Penyediaan), Penyediaan, Stok Kapital, Aset Moneter, Neraca Terpadu, PDB vs PDN1, Studi PDB, Penduduk, National Wealth |

Metode scan: `ExcelJS` (`server/node_modules/exceljs`), baca `cell.value` vs `cell.formula` + `sharedFormula` + `result` + `numFmt`, plus daftar `worksheet.tables` dan isi file zip (`externalLinks`).

## 2. Temuan penting (wajib dibaca sebelum desain DB)

1. **Tidak ada Excel Structured Table (ListObject) di kedua file.** `ws.tables = 0` untuk semua 13 sheet. Maka kolom **Nama Tabel** di bawah adalah **blok tabel logis** (judul visual + range), bukan nama Table Excel. Ini sengaja agar langsung bisa jadi kandidat nama tabel database.
2. **Tidak ditemukan external workbook link.** Hasil scan isi `.xlsx` (zip entries) tidak ada folder `externalLinks`, tidak ada pola `[*.xlsx]` / path `C:\` / `http` di dalam rumus. Jadi kategori ketiga di bawah **bukan** berasal dari link Excel eksternal, melainkan dari **nilai statis yang dokumennya jelas berasal dari luar 2 file ini** (BPS, SUT, DNPeng, PJ PDRB, neraca aset mineral). Sesuai instruksi, semua itu diberi tipe `formula tapi input manual` supaya di website diperlakukan sebagai **input manual** (form/API), bukan dihitung.
3. **Banyak "hasil hitungan" yang di Excel tersimpan sebagai angka statis (paste-values).** Contoh: `Penyusutan!C13:G13` (GNP), `Penyusutan!C21:G21` (Pendapatan Nasional), `Aset Moneter!D10/D14/D16` (total penambahan/pengurangan/stok akhir), blok bawah `PDB vs PDN1!D21:F64`. Di kolom Rule saya tulis rumus yang *seharusnya*, dan di kolom Tipe tetap mengikuti realita Excel + asal sumber. Rekomendasi DB: jadikan **generated column / service hitung**, bukan input.
4. **Tahun `2023*` dan `2024**` adalah teks (string), bukan angka.** `*` = sangat sementara, `**` = sangat sangat sementara (lihat pola di semua sheet). Di database gunakan kolom `tahun` (INT) + `status_angka` (ENUM: `tetap/sementara/sangat_sementara`) atau simpan `label_tahun` terpisah.
5. **Struktur tahun di F2 adalah wide-format (kolom per tahun).** Contoh `PDB ADHB!B:L` = 2014-2024, `Penyusutan!C:BO` = triwulan x tahun, `Neraca Terpadu!C:BP` = 6 kolom kegiatan x 11 tahun. Di database normalkan jadi **long-format**: `tahun, triwulan, komponen, nilai`.
6. **Sheet `Bond` (F1) adalah file synthetic/uji, kolom M-W sebagian besar kosong.** Kolom N/O/S/V ada isi tanpa header (kemungkinan helper). Semua datanya statis.

## 3. Legenda kolom dan tipe

Kolom inventaris (sesuai permintaan):

`nama file | nama sheet | nama tabel | nama variabel | isian | rule pengisian | tipe | akan direfer oleh rumus/file apa`

Definisi **Tipe** yang dipakai di file ini:

| Tipe | Arti | Kriteria di Excel | Perlakuan di website/DB |
|---|---|---|---|
| `input manual` | Diketik langsung, murni internal/label/parameter | Tidak ada rumus, bukan data dari luar (judul, nama komponen, konstanta helper, data uji Bond) | Kolom input teks/angka atau master statis |
| `hasil formulasi` | Dihitung dari cell lain di dalam 2 file ini | Ada `formula` (termasuk `sharedFormula`) yang referensinya internal | Kolom generated / view / service hitung, JANGAN jadi input |
| `formula tapi input manual` | Nilai terlihat manual TAPI secara logis refer dari luar 2 file ini | Tidak ada rumus (atau rumus berisi literal dari luar) + dokumentasi sumber luar (BPS/SUT/DNPeng/neraca mineral/penduduk/kurs) | Wajib jadi **input manual** di website (form impor/API), karena sumber luar tidak ikut dimigrasi |

Kolom **Rule Pengisian**: berisi rumus Excel asli (kutipan) atau aturan isi + satuan + format (`#,##0`, `%`, `Rp`, `USD`, tanggal). Tanda `$` dipertahankan apa adanya.
Kolom **Akan direfer oleh**: daftar downstream (sheet!range) yang memakai variabel ini. Arah baca: `A -> B` artinya B memakai A.

## 4. Ringkasan sheet -> blok tabel logis -> kandidat tabel DB

| File | Sheet | Blok Tabel Logis (range isi) | Kandidat Tabel DB |
|---|---|---|---|
| F1 | Bond | T1 Portofolio Obligasi (A3:L8) + helper tanpa header (N,O,S,V) | `bond_portofolio` |
| F2 | READ ME | T0 Dokumentasi revisi (A1:N11) | tidak jadi tabel (catatan rilis saja) |
| F2 | PDB ADHB | T1 PDB Penggunaan Seri 2010 (A1:L37) | `pdb_adhb` (long: tahun, komponen, nilai_miliar_rp) |
| F2 | Penyusutan | T1 Pendapatan Nasional triwulanan (A1:BO21) | `penyusutan_triwulan` (tahun, triwulan, baris_akun, nilai) |
| F2 | SUT (Rasio Penyediaan) | T1 Rasio Penyediaan (A1:F5) | `sut_rasio` (tahun_sut, pdb_p, top_sop, output, rasio) |
| F2 | Penyediaan | T1 Penyediaan-Penggunaan (A2:AH11) | `penyediaan` (tahun, aktivitet, total_penyediaan, total_penggunaan, pdb) |
| F2 | Stok Kapital | T1 Stok Kapital (A2:CK34) | `stok_kapital` (tahun, baris, kolom_akun, nilai) |
| F2 | Aset Moneter | T1-T10 per komoditas (A1:N106, 10 blok) | `aset_moneter` (tahun, komoditas, unsur, nilai_miliar_rp) |
| F2 | Neraca Terpadu | T1 Neraca Terpadu (A2:BP77) | `neraca_terpadu` (tahun, komponen, kegiatan, nilai) -- full generated |
| F2 | PDB vs PDN1 | T1 Atas Nilai+Distribusi (A3:AT8); T2 Bawah Ringkas (A19:F64) | `pdb_vs_pdn1` (tahun, ukuran=pdn/pdn1, komponen, nilai, distribusi) -- full generated |
| F2 | Studi PDB | T1 Studi PDB/PDN/PDN1 (A3:N23) | `studi_pdb` (tahun, ukuran, nilai, rasio) -- full generated |
| F2 | Penduduk | T1 Penduduk+PDB per kapita (A3:K15) | `penduduk` (tahun, pdb_miliar, penduduk_ribu, pdb_perkapita, kurs, pdb_usd) |
| F2 | National Wealth | T1 Nilai aset (A3:F15); T2 Per kapita+growth (A17:G29); T3 Penyusutan (A31:E43) | `national_wealth` (tahun, jenis_aset, nilai, perkapita, growth) -- full generated |

---

## 5. Inventaris F1 -- synthetic-bond.xlsx

### 5.1 Sheet Bond / T1 Portofolio Obligasi (A3:L8, 5 baris data R4:R8)

| Nama File | Nama Sheet | Nama Tabel | Nama Variabel | Isian | Rule Pengisian | Tipe | Akan direfer oleh rumus/file apa |
|---|---|---|---|---|---|---|---|
| synthetic-bond.xlsx | Bond | T1 Portofolio Obligasi | judul_merge (A1:W1) | `BOND OBLIGASI NEGARA - PORTOFOLIO` | Merge A1:W1, teks judul, bukan data | input manual | tidak direfer (display only) |
| synthetic-bond.xlsx | Bond | T1 Portofolio Obligasi | tahun (A4:A8) | `2008, 2009, 2010, 2008, 2012` | Angka tahun, ketik manual, format `0` | input manual | tidak ada rumus downstream di 2 file ini |
| synthetic-bond.xlsx | Bond | T1 Portofolio Obligasi | tanggal (B4:B8) | `2008-12-31, 2009-12-31, ...` | Tanggal, format `dd-mmm-yyyy`, ketik manual | input manual | -- |
| synthetic-bond.xlsx | Bond | T1 Portofolio Obligasi | tenor_5Y (C4:C8) | `5, 5, 10, 10, 15` | Angka tenor, format `0`, ketik manual | input manual | -- |
| synthetic-bond.xlsx | Bond | T1 Portofolio Obligasi | fr (D4:D8) | `0.0062, 0.0058, ...` | Desimal, format `0.000%`, ketik manual | input manual | -- |
| synthetic-bond.xlsx | Bond | T1 Portofolio Obligasi | fr_persen (E4:E8) | `0.09, 0.1203, ...` | Desimal, format `0.00%`, ketik manual | input manual | -- |
| synthetic-bond.xlsx | Bond | T1 Portofolio Obligasi | end_date (F4:F8) | `2035-03-15, ...` | Tanggal jatuh tempo, format `dd-mmm-yyyy` | input manual | -- |
| synthetic-bond.xlsx | Bond | T1 Portofolio Obligasi | harga_price (G4:G8) | `99999.5, 98765.25, ...` | Miliar/unit, format `#,##0.00` | input manual | -- |
| synthetic-bond.xlsx | Bond | T1 Portofolio Obligasi | yield (H4:H8) | `0.0503, 0.0519, ...` | Desimal, format `0.00%` | input manual | -- |
| synthetic-bond.xlsx | Bond | T1 Portofolio Obligasi | kolom_I_kosong (I4:I8) | `(kosong)` | Kolom spacer, biarkan null | input manual | -- |
| synthetic-bond.xlsx | Bond | T1 Portofolio Obligasi | spread (J4:J8) | `0.012, 0.013, ...` | Desimal, format `0.000%` | input manual | -- |
| synthetic-bond.xlsx | Bond | T1 Portofolio Obligasi | par_value (K4:K8) | `1000000` (semua baris) | Nominal, format `#,##0` | input manual | -- |
| synthetic-bond.xlsx | Bond | T1 Portofolio Obligasi | kupon (L4:L8) | `0.0875` (semua baris) | Desimal, format `0.0000%` | input manual | -- |
| synthetic-bond.xlsx | Bond | T1 Helper tanpa header | helper_N (N4:N8) | `2008, 2009, 2010, 2011, 2012` | Tanpa header R3, angka tahun, format `0` | input manual | tidak ada rumus yang memakai (kolom yatim) |
| synthetic-bond.xlsx | Bond | T1 Helper tanpa header | helper_O (O4:O8) | `1.5, 1.6, 1.7, 1.8, 1.9` | Tanpa header, desimal format `0.0` | input manual | -- |
| synthetic-bond.xlsx | Bond | T1 Helper tanpa header | helper_S (S4:S8) | `2008..2012` | Tanpa header, duplikat tahun | input manual | -- |
| synthetic-bond.xlsx | Bond | T1 Helper tanpa header | helper_V (V4:V8) | `0.0422..0.0462` | Tanpa header, desimal `0.0000%` | input manual | -- |
| synthetic-bond.xlsx | Bond | -- | kolom_M,P,Q,R,T,U,W | `(kosong)` | Selalu kosong di R4:R8, jadikan nullable/drop | input manual | -- |

---

## 6. Inventaris F2 -- original-7502adecb7ad.xlsx

### 6.1 Sheet READ ME (A1:N11) -- dokumentasi saja, tidak jadi tabel DB

| Nama File | Nama Sheet | Nama Tabel | Nama Variabel | Isian | Rule Pengisian | Tipe | Akan direfer oleh rumus/file apa |
|---|---|---|---|---|---|---|---|
| original-7502adecb7ad.xlsx | READ ME | T0 Dokumentasi | info_publikasi (A1) | `Data yang di-update saat penulisan Publikasi Sisnerling 2020-2024 (18 Nov 2025)` | Teks info, merge A1:N1 | input manual | tidak direfer rumus (konteks manusia) |
| original-7502adecb7ad.xlsx | READ ME | T0 Dokumentasi | revisi_penyediaan (A2) | `Sheet Penyediaan: revisi Rasio NTB... SUT 2020 utk 2020, SUT 2021 utk 2021-skrg` | Teks revisi | input manual | menjelaskan `Penyediaan` memakai `SUT!B5/F5` |
| original-7502adecb7ad.xlsx | READ ME | T0 Dokumentasi | revisi_stok_kapital (A3) | `Data stok kapital dari DNPeng tiap 5 thn... 2023-2024 estimasi sendiri` | Teks revisi | input manual | menjelaskan `Stok Kapital` 2023-2024 estimasi |
| original-7502adecb7ad.xlsx | READ ME | T0 Dokumentasi | kesimpulan (A4) | `Neraca Terintegrasi 2020-2024 tidak ada angka tetap...` | Teks kesimpulan | input manual | -- |
| original-7502adecb7ad.xlsx | READ ME | T0 Dokumentasi | petunjuk_sheet (A5:A11) | `Perhitungan dan meminta nilai Stok Akhir ke DNPeng...`, `Sheet bantu`, `Full Perhitungan` | Label alur kerja | input manual | -- |

### 6.2 Sheet PDB ADHB (A1:L37) / T1 PDB Penggunaan Seri 2010

Header tahun: `C1=2015, F1=2018, G1=2019, H1=2020, I1=2021, J1=2022` statis; `B1=C1-1`, `D1=C1+1`, `E1=C1+2`; `K1="2023*"`, `L1="2024**"` (teks). Baris R2:R5 adalah cermin tahun. Semua nilai B6:L37 dalam miliar Rp.

| Nama File | Nama Sheet | Nama Tabel | Nama Variabel | Isian | Rule Pengisian | Tipe | Akan direfer oleh rumus/file apa |
|---|---|---|---|---|---|---|---|
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | tahun_anchor (B1:L1) | `2014..2024**` | `B1=C1-1`; `C1=2015` ketik; `D1=C1+1`; `E1=C1+2`; `F1:L1` ketik (`2023*`,`2024**` teks) | hasil formulasi (B1,D1,E1) + formula tapi input manual (C1,F1:L1 anchor dari publikasi BPS) | Direfer oleh SEMUA sheet: Penyusutan!R3, Penyediaan!R2, Stok Kapital!R2, Aset Moneter!R4/R20/dst, Neraca Terpadu!R2, PDB vs PDN1!R3, Studi PDB!R3, Penduduk!A, National Wealth |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | konsumsi_rt_total (B6:L6) `1. Pengeluaran Konsumsi Rumahtangga` | `5915194.23 (2014)` | Angka miliar Rp `#,##0`, dari BPS | formula tapi input manual | `Penyediaan!C5/F5/...` (`=B6+B14+B15`) |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | konsumsi_makanan (B7:L7) | `2247450.58` | idem | formula tapi input manual | komponen rincian (tidak dirumuskan lanjut, display) |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | konsumsi_pakaian (B8:L8) | `221633.20` | idem | formula tapi input manual | -- |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | konsumsi_perumahan (B9:L9) | `774867.35` | idem | formula tapi input manual | -- |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | konsumsi_kesehatan_pendidikan (B10:L10) | `394267.50` | idem | formula tapi input manual | -- |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | konsumsi_transport_komunikasi (B11:L11) | `1420289.14` | idem | formula tapi input manual | -- |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | konsumsi_restoran_hotel (B12:L12) | `570464.73` | idem | formula tapi input manual | -- |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | konsumsi_lainnya (B13:L13) | `286221.70` | idem | formula tapi input manual | -- |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | konsumsi_lnprt (B14:L14) `2. LNPRT` | `124242.00` | idem | formula tapi input manual | `Penyediaan` konsumsi akhir |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | konsumsi_pemerintah (B15:L15) | `996197.44` | idem | formula tapi input manual | `Penyediaan` konsumsi akhir |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | konsumsi_kolektif (B16:L16) | `622774.28` | rincian pemerintah | formula tapi input manual | display |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | konsumsi_individu (B17:L17) | `373423.15` | rincian pemerintah | formula tapi input manual | display |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | pmtb_total (B18:L18) `4. PMTB` | `3436923.74` | idem | formula tapi input manual | `Penyediaan!C6` + `Stok Kapital!I10/Q10/...` (`=B7+PDB!B18`) |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | pmtb_bangunan (B19:L19) | `2569122.38` | rincian PMTB | formula tapi input manual | display |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | pmtb_mesin (B20:L20) | `357548.27` | rincian | formula tapi input manual | display |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | pmtb_kendaraan (B21:L21) | `163609.25` | rincian | formula tapi input manual | display |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | pmtb_peralatan (B22:L22) | `49215.11` | rincian | formula tapi input manual | display |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | pmtb_cbr (B23:L23) | `201675.93` | rincian | formula tapi input manual | display |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | pmtb_hki (B24:L24) | `95752.78` | rincian | formula tapi input manual | display |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | perubahan_inventori (B25:L25) | `220230.64` | bisa negatif, `#,##0` | formula tapi input manual | `Penyediaan` akumulasi |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | ekspor_total (B26:L26) | `2501424.82` | idem | formula tapi input manual | `Penyediaan!C7/F7` (luar negeri) |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | ekspor_barang (B27:L27) | `2223341.96` | rincian | formula tapi input manual | display |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | ekspor_nonmigas (B28:L28) | `1869262.14` | rincian | formula tapi input manual | display |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | ekspor_migas (B29:L29) | `354079.81` | rincian | formula tapi input manual | display |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | ekspor_jasa (B30:L30) | `278082.86` | rincian | formula tapi input manual | display |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | impor_total (B31:L31) | `2580508.03` | idem | formula tapi input manual | `Penyediaan!B7/E7` (luar negeri) |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | impor_barang (B32:L32) | `2177252.98` | rincian | formula tapi input manual | display |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | impor_nonmigas (B33:L33) | `1652229.16` | rincian | formula tapi input manual | display |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | impor_migas (B34:L34) | `525023.82` | rincian | formula tapi input manual | display |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | impor_jasa (B35:L35) | `403255.05` | rincian | formula tapi input manual | display |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | diskrepansi (B36:L36) | `-43999.55` | bisa negatif | formula tapi input manual | `Penyediaan` akumulasi |
| original-...xlsx | PDB ADHB | T1 PDB Penggunaan | pdb_total (B37:L37) `8. PDB` | `10569705.30` | Total PDB miliar Rp | formula tapi input manual | `Penyediaan!D4/G4` (`=PDB!B37`), `Stok Kapital` (via Penyediaan), `Penduduk!B5:B15`, `Studi PDB` (via Stok Kapital) |

### 6.3 Sheet Penyusutan (A1:BO21) / T1 Pendapatan Nasional triwulanan

Pola kolom per tahun: 5 kolom `Q1,Q2,Q3,Q4,Total` x 11 tahun (2014 di C:G ... 2024 di terakhir). Header tahun R3 adalah rumus `='PDB ADHB'!C1-1`, `='PDB ADHB'!C1`, dst. Header triwulan R4 label `Q1..Total`. Semua angka nasional dalam miliar Rp, statis di Excel.

| Nama File | Nama Sheet | Nama Tabel | Nama Variabel | Isian | Rule Pengisian | Tipe | Akan direfer oleh rumus/file apa |
|---|---|---|---|---|---|---|---|
| original-...xlsx | Penyusutan | T1 Pendapatan Nasional | tahun_triwulan_header (C3:BO3 + C4:BO4) | `2014/Q1..2024/Total` | `R3='PDB ADHB'!x`; `R4=Q1..Total` ketik | hasil formulasi (R3) + input manual (R4) | header kolom, tidak dihitung |
| original-...xlsx | Penyusutan | T1 Pendapatan Nasional | pdb_triwulan (R6: C6:BO6) `1. PDB` | `2506300.2 (2014-Q1)` | Statis triwulanan BPS; `G6`=total tahun | formula tapi input manual | Seharusnya `=C37 PDB ADHB` per tahun untuk kolom Total; total dipakai `Stok Kapital`? (cek: Stok Kapital pakai G19/M19, bukan R6) |
| original-...xlsx | Penyusutan | T1 Pendapatan Nasional | net_factor_abroad (R9) `2. Neto luar negeri` | `-86145.71` | Statis; logika =R10-R11 | formula tapi input manual | `R13 GNP` (logis, tapi di Excel paste-values) |
| original-...xlsx | Penyusutan | T1 Pendapatan Nasional | factor_dari_luar (R10) `2a` | `4604.82` | Statis | formula tapi input manual | -- |
| original-...xlsx | Penyusutan | T1 Pendapatan Nasional | factor_ke_luar (R11) `2b` | `90750.54` | Statis | formula tapi input manual | -- |
| original-...xlsx | Penyusutan | T1 Pendapatan Nasional | gnp_triwulan (R13) `3. GNP` | `2420154.48` | Seharusnya `=R6+R9` (cek 2506300.2-86145.7 cocok), tapi tersimpan statis | formula tapi input manual | `R21` (logis) |
| original-...xlsx | Penyusutan | T1 Pendapatan Nasional | pajak_neto (R15) `4. Pajak-Subsidi` | `102291.53` | Seharusnya `=R16-R17` | formula tapi input manual | `R21` (logis) |
| original-...xlsx | Penyusutan | T1 Pendapatan Nasional | pajak_tidak_langsung (R16) | `141907.80` | Statis | formula tapi input manual | -- |
| original-...xlsx | Penyusutan | T1 Pendapatan Nasional | subsidi (R17) | `39616.27` | Statis | formula tapi input manual | -- |
| original-...xlsx | Penyusutan | T1 Pendapatan Nasional | penyusutan_cfc (R19) `5. Penyusutan` | `492629.85 (2014-Q1, diulang 4x)` | Q1=Q2=Q3=Q4 (pola flat, kemungkinan alokasi), `G19`=total | formula tapi input manual | `Stok Kapital!F5/N5/V5...` (`=Penyusutan!G19/M19/S19...`), `Neraca Terpadu!C22` (via Stok Kapital) |
| original-...xlsx | Penyusutan | T1 Pendapatan Nasional | national_income (R21) `6. Pendapatan Nasional` | `1825233.09` | Seharusnya `=R13-R15-R19`, tersimpan statis | formula tapi input manual | Display/final (tidak dirumuskan lanjut di 2 file ini) |

Rekomendasi DB: simpan hanya input (`pdb_triwulan, factor_in/out, pajak, subsidi, penyusutan`) sebagai input; `gnp, pajak_neto, national_income` jadikan generated.

### 6.4 Sheet SUT (Rasio Penyediaan) (A1:F5) / T1 Rasio

Kolom B:F = SUT 2010, 2016, 2019, 2020, 2021 (R1 label tahun SUT, ketik manual).

| Nama File | Nama Sheet | Nama Tabel | Nama Variabel | Isian | Rule Pengisian | Tipe | Akan direfer oleh rumus/file apa |
|---|---|---|---|---|---|---|---|
| original-...xlsx | SUT (Rasio Penyediaan) | T1 Rasio | pdb_p_total_ntb (R2 B2:F2) | `6683679717 (2010)` | Integer rupiah, dari publikasi SUT | formula tapi input manual | `R5` (`=B4/(B2+B3)`) |
| original-...xlsx | SUT (Rasio Penyediaan) | T1 Rasio | top_sop (R3) | `180453318` | idem | formula tapi input manual | `R5` |
| original-...xlsx | SUT (Rasio Penyediaan) | T1 Rasio | output_domestik (R4) | `13109120481` | idem | formula tapi input manual | `R5` |
| original-...xlsx | SUT (Rasio Penyediaan) | T1 Rasio | rasio_output (R5 B5:F5) | `1.90979 (2010)` | `=B4/(B2+B3)` dst (sharedFormula) | hasil formulasi | `Penyediaan!B4/E4/H4...` (`='SUT'!$B$5*D4`, `$C$5`, `$D$5`, `$E$5`, `$F$5` -- mapping: 2014 pakai B5; 2015-2018 pakai C5; 2019 pakai D5; 2020 pakai E5; 2021-2024 pakai F5) |

### 6.5 Sheet Penyediaan (A2:AH11) / T1 Penyediaan-Penggunaan

Pola kolom per tahun: 3 kolom `Total Penyediaan | Total Penggunaan | PDB` x 11 tahun (2014 di B:D ... 2024 di ...). R2 tahun = rumus (`=E2-1`, `='PDB ADHB'!C1`, dst). R3 header jenis nilai.

| Nama File | Nama Sheet | Nama Tabel | Nama Variabel | Isian | Rule Pengisian | Tipe | Akan direfer oleh rumus/file apa |
|---|---|---|---|---|---|---|---|
| original-...xlsx | Penyediaan | T1 Penyediaan | tahun_header (B2:AH2) | `2014..2024**` | `=E2-1` / `='PDB ADHB'!C1..L1` | hasil formulasi | header |
| original-...xlsx | Penyediaan | T1 Penyediaan | industri_penyediaan (R4: B4,E4,H4...) `Total Penyediaan Industri` | `20186021.96 (2014)` | `='SUT'!$x$5 * PDB_tahun` cth `='SUT'!$B$5*D4` | hasil formulasi | `Stok Kapital!C5/K5/S5...` (`=Penyediaan!B4`) |
| original-...xlsx | Penyediaan | T1 Penyediaan | industri_penggunaan (R4: C4,F4...) `Total Penggunaan` | `9616316.66` | `=B4-D4` (penyediaan - PDB) | hasil formulasi | `Stok Kapital!D5/L5/T5...` |
| original-...xlsx | Penyediaan | T1 Penyediaan | industri_pdb (R4: D4,G4...) | `10569705.30` | `='PDB ADHB'!B37` dst langsung | hasil formulasi | `Stok Kapital!E5/M5...`; `SUT` tidak, ini input PDB |
| original-...xlsx | Penyediaan | T1 Penyediaan | konsumsi_akhir (R5) | `7035633.67` | `='PDB ADHB'!B6+B14+B15` dst | hasil formulasi | `Stok Kapital!D6/L6/T6...` |
| original-...xlsx | Penyediaan | T1 Penyediaan | akumulasi (R6) | `3613154.83` | `='PDB ADHB'!B18+B25+B36` dst | hasil formulasi | `Stok Kapital!D7/L7...` |
| original-...xlsx | Penyediaan | T1 Penyediaan | luarnegeri_impor (R7: B7,E7...) | `2580508.03` | `='PDB ADHB'!B31` dst | hasil formulasi | `Stok Kapital!C8/K8...` |
| original-...xlsx | Penyediaan | T1 Penyediaan | luarnegeri_ekspor (R7: C7,F7...) | `2501424.82` | `='PDB ADHB'!B26` dst | hasil formulasi | `Stok Kapital!D8/L8...` |
| original-...xlsx | Penyediaan | T1 Penyediaan | total_all (R8) | `22766530.00` | `=SUM(B4:B7)` dst | hasil formulasi | `Stok Kapital!C9/D9/K9/L9...` (cek konsistensi) |
| original-...xlsx | Penyediaan | T1 Penyediaan | catatan_lk (R11) | `*LK Stok Kapital untuk based tahun 2005` | Teks catatan | input manual | -- |

### 6.6 Sheet Stok Kapital (A2:CK34) / T1 Stok Kapital

Pola per tahun 8 kolom: `1.Stok Awal | 2.Penyediaan | 3.Penggunaan | 4.PDB | 5.Penyusutan | 6.PDN | 7.Revaluasi | 8.Stok Akhir`. 11 blok tahun (2014 di B:I ... 2024 di ...). R2 tahun, R3 nama kolom akun, R4 sublabel (Barang Modal). Baris akun R5:R10 + dokumentasi R12:R34.

| Nama File | Nama Sheet | Nama Tabel | Nama Variabel | Isian | Rule Pengisian | Tipe | Akan direfer oleh rumus/file apa |
|---|---|---|---|---|---|---|---|
| original-...xlsx | Stok Kapital | T1 Stok Kapital | tahun_header (B2:CK2) | `2014..2024**` | `=J2-1` / `='PDB ADHB'!C1..L1` | hasil formulasi | header |
| original-...xlsx | Stok Kapital | T1 Stok Kapital | stok_awal_barang_modal (R7: B7,J7,R7...) | `33313960.60 (2014)` | 2014 ketik (dari DNPeng); 2015+ `=I7`/`=Q7` (stok akhir thn lalu) | formula tapi input manual (2014 anchor) + hasil formulasi (2015+ `=stok_akhir_lalu`) | `Neraca Terpadu!E9` (`='Stok Kapital'!B7`), `National Wealth` (via Neraca) |
| original-...xlsx | Stok Kapital | T1 Stok Kapital | industri_penyediaan (R5: C5,K5...) | `20186021.96` | `=Penyediaan!B4` dst | hasil formulasi | `Neraca Terpadu!C20` (`='Stok Kapital'!C5`) |
| original-...xlsx | Stok Kapital | T1 Stok Kapital | industri_penggunaan (R5: D5,L5...) | `9616316.66` | `=Penyediaan!C4` dst | hasil formulasi | `Neraca Terpadu!C21` |
| original-...xlsx | Stok Kapital | T1 Stok Kapital | industri_pdb (R5: E5,M5...) | `10569705.30` | `=Penyediaan!D4` dst | hasil formulasi | -- (diteruskan via PDN) |
| original-...xlsx | Stok Kapital | T1 Stok Kapital | industri_penyusutan (R5: F5,N5...) | `1970519.41` | `=Penyusutan!G19/M19...` | hasil formulasi | `Neraca Terpadu!C22` |
| original-...xlsx | Stok Kapital | T1 Stok Kapital | industri_pdn (R5: G5,O5...) `6. PDN` | `8599185.88` | `=E5-F5` | hasil formulasi | `Studi PDB!B6:L6` (`='Stok Kapital'!G5/O5/W5...`) |
| original-...xlsx | Stok Kapital | T1 Stok Kapital | konsumsi_akhir (R6) | `7035633.67` | `=Penyediaan!C5` dst | hasil formulasi | `Neraca Terpadu!D21` |
| original-...xlsx | Stok Kapital | T1 Stok Kapital | akumulasi_modal (R7: D7,F7,G7,H7,I7) | `D7=3613154.83; F7=-1970519.41 (=-F5); G7=1642635.41 (=D7+F7); H7=3145856.65 (=I7-B7-G7); I7=38102452.67` | Lihat rumus tiap kolom | hasil formulasi | `Neraca Terpadu` (E21 via D7? cek: `C21` pakai D5 bukan D7; akumulasi dipakai di `PDB vs PDN1` via Neraca) |
| original-...xlsx | Stok Kapital | T1 Stok Kapital | luar_negeri (R8) | `B7/C7 impor/ekspor` | `=Penyediaan!B7/C7` dst | hasil formulasi | `Neraca Terpadu!G21/G20` |
| original-...xlsx | Stok Kapital | T1 Stok Kapital | total_check (R9) | `22766530.00` | `=Penyediaan!B8/C8` | hasil formulasi | cek konsistensi |
| original-...xlsx | Stok Kapital | T1 Stok Kapital | validasi_pmtb (R10: I10,Q10...) | `36750884.34` | `=B7+'PDB ADHB'!B18` (stok awal + PMTB) | hasil formulasi | validasi, bukan refer utama |
| original-...xlsx | Stok Kapital | T1 Dok | sumber_data_label (R12:R34) | `Sumber Data: ... S.Akhir Thn sblmnya / Output PDB / ... / S.Awal+PMTB` + catatan `Update: ... DNPeng... 2023 estimasi` | Teks dokumentasi alur | input manual | menjelaskan rule tiap baris, tidak dirumuskan |

### 6.7 Sheet Aset Moneter (A1:N106) / T1-T10 per komoditas (satuan miliar Rp)

Header tahun tiap blok: `D= E-1 / 'PDB ADHB'!C1..L1` (R4,R20,R30,R40,R50,R60,R70,R80,R90,R100). Semua nilai D:N statis dari neraca aset mineral (luar file). Struktur per blok diringkas per unsur (satu baris inventaris = satu unsur x 11 tahun).

| Nama File | Nama Sheet | Nama Tabel | Nama Variabel | Isian | Rule Pengisian | Tipe | Akan direfer oleh rumus/file apa |
|---|---|---|---|---|---|---|---|
| original-...xlsx | Aset Moneter | T1 Hasil Hutan (R2:R16) | hutan_tahun (D4:N4) | `2014..2024**` | `=E4-1` / `='PDB ADHB'!C1..` | hasil formulasi | header |
| original-...xlsx | Aset Moneter | T1 Hasil Hutan | hutan_opening (R6 D6:N6) | `701661.76 (2014)` | Statis neraca mineral | formula tapi input manual | `Neraca Terpadu!F10` (`='Aset Moneter'!D6`) + `National Wealth` via Neraca |
| original-...xlsx | Aset Moneter | T1 Hasil Hutan | hutan_natural_growth (R8) | `4013.48` | Statis | formula tapi input manual | (komponen R10, tapi R10 paste-values) |
| original-...xlsx | Aset Moneter | T1 Hasil Hutan | hutan_reclass (R9) | `1626.28` | Statis | formula tapi input manual | -- |
| original-...xlsx | Aset Moneter | T1 Hasil Hutan | hutan_total_add (R10) | `5639.76` | Seharusnya `=R8+R9`, tersimpan statis | formula tapi input manual | `Neraca Terpadu!F36` (`='Aset Moneter'!D10`) |
| original-...xlsx | Aset Moneter | T1 Hasil Hutan | hutan_removals (R12) | `6621.45` | Statis | formula tapi input manual | (komponen R14) |
| original-...xlsx | Aset Moneter | T1 Hasil Hutan | hutan_losses (R13) | `28141.49` | Statis | formula tapi input manual | -- |
| original-...xlsx | Aset Moneter | T1 Hasil Hutan | hutan_total_red (R14) | `34762.94` | Seharusnya `=R12+R13`, statis | formula tapi input manual | `Neraca Terpadu!C25` (`='Aset Moneter'!D14`) |
| original-...xlsx | Aset Moneter | T1 Hasil Hutan | hutan_revaluasi (R15) | `47446.50` | Statis | formula tapi input manual | `Neraca Terpadu!F49` (`='Aset Moneter'!D15`) |
| original-...xlsx | Aset Moneter | T1 Hasil Hutan | hutan_closing (R16) | `719985.08` | Seharusnya `=open+add-red+rev`, statis | formula tapi input manual | `Neraca Terpadu!F61` (`='Aset Moneter'!D16`) + `National Wealth` via Neraca |
| original-...xlsx | Aset Moneter | T2 Minyak Bumi (R18:R26) | minyak_opening (R22) | `2131737.97` | Statis | formula tapi input manual | `Neraca F11`, `F37/F50/F62` |
| original-...xlsx | Aset Moneter | T2 Minyak Bumi | minyak_extraction (R23, negatif) | `-78448.95` | Negatif, statis | formula tapi input manual | `Neraca C26` (`=-'Aset Moneter'!D23`) |
| original-...xlsx | Aset Moneter | T2 Minyak Bumi | minyak_other_changes (R24) | `30720.52` | Statis | formula tapi input manual | `Neraca F37` |
| original-...xlsx | Aset Moneter | T2 Minyak Bumi | minyak_revaluasi (R25) | `-147335.56` | Statis | formula tapi input manual | `Neraca F50` |
| original-...xlsx | Aset Moneter | T2 Minyak Bumi | minyak_closing (R26) | `1936673.97` | Statis | formula tapi input manual | `Neraca F62` |
| original-...xlsx | Aset Moneter | T3 Gas Alam (R28:R36) | gas_opening (R32) | `2209651.18` | Statis | formula tapi input manual | `Neraca F12/F38/F51/F63` |
| original-...xlsx | Aset Moneter | T3 Gas Alam | gas_extraction (R33) | `-43852.88` | Negatif | formula tapi input manual | `Neraca C27` (`=-D33`) |
| original-...xlsx | Aset Moneter | T3 Gas Alam | gas_other (R34) | `28780.91` | Statis | formula tapi input manual | `Neraca F38` |
| original-...xlsx | Aset Moneter | T3 Gas Alam | gas_revaluasi (R35) | `-265018.80` | Statis | formula tapi input manual | `Neraca F51` |
| original-...xlsx | Aset Moneter | T3 Gas Alam | gas_closing (R36) | `1929560.40` | Statis | formula tapi input manual | `Neraca F63` |
| original-...xlsx | Aset Moneter | T4 Batubara (R38:R46) | batubara_opening (R42) | `3124469.70` | Statis | formula tapi input manual | `Neraca F13/F39/F52/F64` |
| original-...xlsx | Aset Moneter | T4 Batubara | batubara_extraction (R43) | `-39616.01` | Negatif | formula tapi input manual | `Neraca C28` |
| original-...xlsx | Aset Moneter | T4 Batubara | batubara_other (R44) | `128481.76` | Statis | formula tapi input manual | `Neraca F39` |
| original-...xlsx | Aset Moneter | T4 Batubara | batubara_revaluasi (R45) | `-838957.18` | Statis | formula tapi input manual | `Neraca F52` |
| original-...xlsx | Aset Moneter | T4 Batubara | batubara_closing (R46) | `2374378.27 (2015)` | Statis (kolom E, dst per tahun) | formula tapi input manual | `Neraca F64` |
| original-...xlsx | Aset Moneter | T5 Emas (R48:R56) | emas_opening (R52) | `193839.93` | Statis | formula tapi input manual | `Neraca F14/F40/F53/F65` |
| original-...xlsx | Aset Moneter | T5 Emas | emas_extraction (R53) | `-5059.79` | Negatif | formula tapi input manual | `Neraca C29` |
| original-...xlsx | Aset Moneter | T5 Emas | emas_other (R54) | `-16505.26` | Statis | formula tapi input manual | `Neraca F40` |
| original-...xlsx | Aset Moneter | T5 Emas | emas_revaluasi (R55) | lihat N55 | Statis | formula tapi input manual | `Neraca F53` |
| original-...xlsx | Aset Moneter | T5 Emas | emas_closing (R56) | lihat N56 | Statis | formula tapi input manual | `Neraca F65` |
| original-...xlsx | Aset Moneter | T6 Perak (R58:R66) | perak_opening (R62) | `14354.01` | Statis | formula tapi input manual | `Neraca F15/F41/F54/F66` |
| original-...xlsx | Aset Moneter | T6 Perak | perak_extraction (R63) | `-250.22` | Negatif | formula tapi input manual | `Neraca C30` |
| original-...xlsx | Aset Moneter | T6 Perak | perak_other (R64) | `241.21` | Statis | formula tapi input manual | `Neraca F41` |
| original-...xlsx | Aset Moneter | T6 Perak | perak_revaluasi (R65) | lihat N65 | Statis | formula tapi input manual | `Neraca F54` |
| original-...xlsx | Aset Moneter | T6 Perak | perak_closing (R66) | lihat N66 | Statis | formula tapi input manual | `Neraca F66` |
| original-...xlsx | Aset Moneter | T7 Tembaga (R68:R76) | tembaga_opening (R72) | `369717.06` | Statis | formula tapi input manual | `Neraca F16/F42/F55/F67` |
| original-...xlsx | Aset Moneter | T7 Tembaga | tembaga_extraction (R73) | `-11086.79` | Negatif | formula tapi input manual | `Neraca C31` |
| original-...xlsx | Aset Moneter | T7 Tembaga | tembaga_other (R74) | `5068.62` | Statis | formula tapi input manual | `Neraca F42` |
| original-...xlsx | Aset Moneter | T7 Tembaga | tembaga_revaluasi (R75) | lihat N75 | Statis | formula tapi input manual | `Neraca F55` |
| original-...xlsx | Aset Moneter | T7 Tembaga | tembaga_closing (R76) | lihat N76 | Statis | formula tapi input manual | `Neraca F67` |
| original-...xlsx | Aset Moneter | T8 Timah (R78:R86) | timah_opening (R82) | `73799.75` | Statis | formula tapi input manual | `Neraca F17/F43/F56/F68` |
| original-...xlsx | Aset Moneter | T8 Timah | timah_extraction (R83) | `-11714.07` | Negatif | formula tapi input manual | `Neraca C32` |
| original-...xlsx | Aset Moneter | T8 Timah | timah_other (R84) | `13491.35` | Statis | formula tapi input manual | `Neraca F43` |
| original-...xlsx | Aset Moneter | T8 Timah | timah_revaluasi (R85) | lihat N85 | Statis | formula tapi input manual | `Neraca F56` |
| original-...xlsx | Aset Moneter | T8 Timah | timah_closing (R86) | lihat N86 | Statis | formula tapi input manual | `Neraca F68` |
| original-...xlsx | Aset Moneter | T9 Nikel (R88:R96) | nikel_opening (R92) | `72154.56` | Statis | formula tapi input manual | `Neraca F18/F44/F57/F69` |
| original-...xlsx | Aset Moneter | T9 Nikel | nikel_extraction (R93) | `-672.84` | Negatif | formula tapi input manual | `Neraca C33` |
| original-...xlsx | Aset Moneter | T9 Nikel | nikel_other (R94) | `2.75` | Statis | formula tapi input manual | `Neraca F44` |
| original-...xlsx | Aset Moneter | T9 Nikel | nikel_revaluasi (R95) | lihat N95 | Statis | formula tapi input manual | `Neraca F57` |
| original-...xlsx | Aset Moneter | T9 Nikel | nikel_closing (R96) | lihat N96 | Statis | formula tapi input manual | `Neraca F69` |
| original-...xlsx | Aset Moneter | T10 Bauksit (R98:R106) | bauksit_opening (R102) | `48504.10` | Statis | formula tapi input manual | `Neraca F19/F45/F58/F70` |
| original-...xlsx | Aset Moneter | T10 Bauksit | bauksit_extraction (R103) | `-68.39` | Negatif | formula tapi input manual | `Neraca C34` |
| original-...xlsx | Aset Moneter | T10 Bauksit | bauksit_other (R104) | `68.39` | Statis | formula tapi input manual | `Neraca F45` |
| original-...xlsx | Aset Moneter | T10 Bauksit | bauksit_revaluasi (R105) | lihat N105 | Statis | formula tapi input manual | `Neraca F58` |
| original-...xlsx | Aset Moneter | T10 Bauksit | bauksit_closing (R106) | lihat N106 | Statis | formula tapi input manual | `Neraca F70` |

### 6.8 Sheet Neraca Terpadu (A2:BP77) / T1 Neraca Terpadu -- SEMUA hasil formulasi

Pola per tahun 6 kolom: `Industri | Konsumsi akhir | Diproduksi | Buatan Alam | Luar Negeri | Kapital Lingkungan`. 11 blok tahun. Header R2 tahun (`=I2-1` / `='PDB ADHB'!C1..`), R3-R6 label kegiatan/kolom akun `(2)(4)(5)(6)(3)(7)`. Hampir semua cell berisi rumus. Contoh 2014 di kolom C:H (C=Industri, D=Konsumsi, E=Diproduksi, F=Buatan Alam, G=Luar Negeri, H=Lingkungan).

| Nama File | Nama Sheet | Nama Tabel | Nama Variabel | Isian | Rule Pengisian | Tipe | Akan direfer oleh rumus/file apa |
|---|---|---|---|---|---|---|---|
| original-...xlsx | Neraca Terpadu | T1 Neraca | tahun_header (C2:BP2) + label R3:R6 | `2014..2024** / Industri / (2)..` | `=I2-1` / `='PDB ADHB'!C1..`; label ketik | hasil formulasi + input manual (label) | header |
| original-...xlsx | Neraca Terpadu | T1 Neraca | stok_awal_barang_modal (R9: E9,K9...) | `33313960.60` | `='Stok Kapital'!B7/J7...` | hasil formulasi | `R48` revaluasi barang modal (logis), `National Wealth!B5` (`='Neraca Terpadu'!E60`) |
| original-...xlsx | Neraca Terpadu | T1 Neraca | stok_awal_10_komoditas (R10:R19 kolom F/L/...) | `701661.76 (hutan 2014)` | `='Aset Moneter'!D6/D22/D32...` langsung | hasil formulasi | `R61:R70` stok akhir? tidak langsung; dipakai `National Wealth!C5` (`=SUM(F61:F70)`) |
| original-...xlsx | Neraca Terpadu | T1 Neraca | penyediaan (R20) | `20186021.96` | `='Stok Kapital'!C5` dst | hasil formulasi | `R23 PDN` (`=C20-C21-C22`) |
| original-...xlsx | Neraca Terpadu | T1 Neraca | penggunaan_3kolom (R21) | `9616316.66 / 7035633.67 / 3613154.83` | `='Stok Kapital'!D5/D6/D7` dst | hasil formulasi | `R23` |
| original-...xlsx | Neraca Terpadu | T1 Neraca | penyusutan_2kolom (R22) | `1970519.41 / -1970519.41` | `='Stok Kapital'!F5` dan `=0-C22` | hasil formulasi | `R23`; `National Wealth!B33` (`='Neraca Terpadu'!C22`) |
| original-...xlsx | Neraca Terpadu | T1 Neraca | pdn (R23: C23,D23,E23,G23) | `8599185.88 (C23 2014)` | `=C20-C21-C22`; `=D21`; `=E21+E22`; `=G21-G20` | hasil formulasi | `PDB vs PDN1!C5/D5/E5` (`='Neraca Terpadu'!D23/E23/G23`), `R46 PDN1` (`=C23-C24`), `National Wealth` via PDN |
| original-...xlsx | Neraca Terpadu | T1 Neraca | deplesi_total (R24) | `225532.93` | `=SUM(C25:C34)` | hasil formulasi | `R46`; `National Wealth!C33` (`='Neraca Terpadu'!C24`) |
| original-...xlsx | Neraca Terpadu | T1 Neraca | deplesi_rinci_10 (R25:R34) | `34762.94 / 78448.95 / ...` | `='Aset Moneter'!D14` / `=-'Aset Moneter'!D23` / ... (F kolom `=0-C24` cermin negatif) | hasil formulasi | `R24` |
| original-...xlsx | Neraca Terpadu | T1 Neraca | perubahan_lain_total (R35) | `195990.05` | `=SUM(F36:F45)`; `=0-F35` cermin | hasil formulasi | `R46`? via F35+F24-F36 (lihat R46-F) |
| original-...xlsx | Neraca Terpadu | T1 Neraca | perubahan_rinci_10 (R36:R45) | `5639.76 / 30720.52 / ...` | `='Aset Moneter'!D10/D24/D34...` | hasil formulasi | `R35` |
| original-...xlsx | Neraca Terpadu | T1 Neraca | pdn1 (R46) | `8373652.94 (C46 2014)` | `=C23-C24` (Industri); `=F35+F24-F36` pola kolom lain | hasil formulasi | `PDB vs PDN1!F7/C7/E7` (`='Neraca Terpadu'!C46/D46/G46...`), `Studi PDB` via PDB vs PDN1 |
| original-...xlsx | Neraca Terpadu | T1 Neraca | revaluasi_barang_modal (R48) | lihat BP48 | `=E60-E46-E9` pola (stok akhir - pdn1 - stok awal) | hasil formulasi | `R47` total revaluasi (logis) |
| original-...xlsx | Neraca Terpadu | T1 Neraca | revaluasi_10_komoditas (R49:R58) | lihat kolom F/L | `='Aset Moneter'!D15/D25/D35...` | hasil formulasi | `R47` |
| original-...xlsx | Neraca Terpadu | T1 Neraca | stok_akhir_barang_modal (R60) | `38102452.67 (E60 2014)` | `='Stok Kapital'!J7` dst (tahun berjalan; Q60 `=K60` dst rantai) | hasil formulasi | `National Wealth!B5:B15` (`='Neraca Terpadu'!E60/K60/Q60...`) |
| original-...xlsx | Neraca Terpadu | T1 Neraca | stok_akhir_10_komoditas (R61:R70) | `719985.08 (hutan)` | `='Aset Moneter'!D16/D26/D36...` | hasil formulasi | `National Wealth!C5:C15` (`=SUM(F61:F70 / L61:L70 ...)`) |

### 6.9 Sheet PDB vs PDN1 (A3:AT64) / T1 Atas + T2 Bawah

T1 Atas R3:R8: per tahun 4 kolom `Konsumsi | Akumulasi neto | Ekspor neto | Jumlah` x 2 ukuran (PDN R5:R6, PDN1 R7:R8). Header tahun R3 (`=G3-1` / `='PDB ADHB'!C1..`). T2 Bawah R19:R64: ringkas per tahun (A=tahun, B=komponen, C=PDN nilai, D=PDN distribusi, E=PDN1 nilai, F=PDN1 distribusi).

| Nama File | Nama Sheet | Nama Tabel | Nama Variabel | Isian | Rule Pengisian | Tipe | Akan direfer oleh rumus/file apa |
|---|---|---|---|---|---|---|---|
| original-...xlsx | PDB vs PDN1 | T1 Atas | tahun_header (C3:AT3) + komponen (C4:AT4) | `2014..2024 / Konsumsi..Jumlah` | `=G3-1` / `='PDB ADHB'!C1..`; komponen ketik | hasil formulasi + input manual | header |
| original-...xlsx | PDB vs PDN1 | T1 Atas | pdn_nilai (R5: C5,E5,G5...) | `7035633.67` | `='Neraca Terpadu'!D23/G23...` langsung | hasil formulasi | `R6` (`=C5/$F$5*100`), `R21:R64 T2` (via TRANSPOSE), `Studi PDB`? tidak langsung (via Stok Kapital) |
| original-...xlsx | PDB vs PDN1 | T1 Atas | pdn_jumlah (R5: F5,J5...) | `8599185.88` | `=SUM(C5:E5)` | hasil formulasi | `R6` penyebut distribusi |
| original-...xlsx | PDB vs PDN1 | T1 Atas | pdn_distribusi (R6) | `81.81%` | `=C5/$F$5*100` (sharedFormula ke kanan) | hasil formulasi | `T2 D21:D64` (paste-values, seharusnya ref) |
| original-...xlsx | PDB vs PDN1 | T1 Atas | pdn1_nilai (R7: C7,D7,E7,F7...) | `C7=7035633.67 (='Neraca D46); D7=1417102.48 (=F7-C7-E7); E7=-79083.21 (='Neraca G46); F7=8373652.94 (='Neraca C46)` | Campuran ref langsung + selisih | hasil formulasi | `R8` + `Studi PDB!B8:L8` (`='PDB vs PDN1'!F7/J7/N7...`) |
| original-...xlsx | PDB vs PDN1 | T1 Atas | pdn1_distribusi (R8) | `84.02%` | `=C7/$F$7*100`, `=SUM(C8:E8)` | hasil formulasi | `T2 F21:F64` (paste) |
| original-...xlsx | PDB vs PDN1 | T1 Atas | sumber_data (R12:R16) | `Sheet Stokkap / Idem PDN / File T-padu = buatan man+alam+lingk` | Teks dokumentasi | input manual | menjelaskan asal R5 vs R7 |
| original-...xlsx | PDB vs PDN1 | T2 Bawah | tahun (A21:A64) | `2014..2024**` | `=C3`, `=A21+1`, `=S3/W3/AA3...`, `=TRANSPOSE(AQ3:AT8)` | hasil formulasi | label baris |
| original-...xlsx | PDB vs PDN1 | T2 Bawah | komponen (B21:B64) | `1. Konsumsi Akhir / 2. Akumulasi / 3. Ekspor Neto / 4. Jumlah` | Teks, diulang per tahun | input manual | label |
| original-...xlsx | PDB vs PDN1 | T2 Bawah | pdn_nilai_ringkas (C21:C64) | `7035633.67` | `=TRANSPOSE(C5:Z8)` utk baris pertama tiap tahun, sisanya paste-values statis | hasil formulasi (baris TRANSPOSE) + input manual (paste -- seharusnya ref ke T1) | Display publikasi |
| original-...xlsx | PDB vs PDN1 | T2 Bawah | pdn_distribusi_ringkas (D21:D64) | `81.81` | Statis paste dari R6 | input manual (seharusnya hasil formulasi) | Display |
| original-...xlsx | PDB vs PDN1 | T2 Bawah | pdn1_nilai_ringkas (E21:E64) | `7035633.67` | Statis paste dari R7 | input manual (seharusnya hasil formulasi) | Display |
| original-...xlsx | PDB vs PDN1 | T2 Bawah | pdn1_distribusi_ringkas (F21:F64) | `84.02` | Statis paste dari R8 | input manual (seharusnya hasil formulasi) | Display |

### 6.10 Sheet Studi PDB (A3:N23) / T1 Studi

Kolom B:L = 2014..2024** (B3 `=C3-1`, C3:L3 `='PDB ADHB'!C1..L1`). Baris: PDB R4, PDN R6, PDN1 R8, rasio R10/R13/R16.

| Nama File | Nama Sheet | Nama Tabel | Nama Variabel | Isian | Rule Pengisian | Tipe | Akan direfer oleh rumus/file apa |
|---|---|---|---|---|---|---|---|
| original-...xlsx | Studi PDB | T1 Studi | tahun (B3:L3) | `2014..2024**` | `B3=C3-1`; `C3:L3='PDB ADHB'!C1..L1` | hasil formulasi | `Penduduk!A5:A15`, `National Wealth!A6:A15/A20:A29/A34:A43` |
| original-...xlsx | Studi PDB | T1 Studi | pdb (B4:L4) | `10569705.30 (2014)` | `='Stok Kapital'!E5/M5/U5...` (via industri PDB) | hasil formulasi | `R10/R13` penyebut (`=B6/B4*100`, `=B8/B4*100`), `Penduduk`? tidak (Penduduk pakai PDB ADHB langsung) |
| original-...xlsx | Studi PDB | T1 Studi | pdn (B6:L6) | `8599185.88` | `='Stok Kapital'!G5/O5/W5...` | hasil formulasi | `R10/R16` |
| original-...xlsx | Studi PDB | T1 Studi | pdn1 (B8:L8) | `8373652.94` | `='PDB vs PDN1'!F7/J7/N7...` | hasil formulasi | `R13/R16` |
| original-...xlsx | Studi PDB | T1 Studi | rasio_pdn_pdb (B10:L10) + sisa (M10) | `81.35%` | `=B6/B4*100` (shared ke kanan); `M10=100-L10` | hasil formulasi | Final display |
| original-...xlsx | Studi PDB | T1 Studi | rasio_pdn1_pdb (B13:L13) + sisa (M13,N12) | `79.22%` | `=B8/B4*100`; `M13=100-L13`; `N12=M13-M10` | hasil formulasi | Final |
| original-...xlsx | Studi PDB | T1 Studi | rasio_pdn1_pdn (B16:L16) | `97.37%` | `=B8/B6*100` | hasil formulasi | Final |
| original-...xlsx | Studi PDB | T1 Studi | catatan (A20:A23) | `PDB/PDN/PDN1 definisi` | Teks | input manual | -- |

### 6.11 Sheet Penduduk (A3:K15) / T1 Penduduk

| Nama File | Nama Sheet | Nama Tabel | Nama Variabel | Isian | Rule Pengisian | Tipe | Akan direfer oleh rumus/file apa |
|---|---|---|---|---|---|---|---|
| original-...xlsx | Penduduk | T1 Penduduk | tahun (A5:A15) | `2014..2024**` | `='Studi PDB'!B3..L3` | hasil formulasi | label baris |
| original-...xlsx | Penduduk | T1 Penduduk | pdb_miliar (B5:B15) | `10569705.30` | `='PDB ADHB'!B37..L37` | hasil formulasi | `D5` (`=+B5/C5*1000000`), `F5` (`=+B5/E5*1000`) |
| original-...xlsx | Penduduk | T1 Penduduk | penduduk_ribu (C5:C15) | `252164.78 (2014)` | `C5=252164786/1000` (formula literal BPS); `C6=255461.686` statis; `C10=266911905/1000` dst campuran | hasil formulasi (yang ada `/1000`) + formula tapi input manual (yang statis, sumber BPS/PJ PDRB) | `D5` (`=+B5/C5*1000000`), `National Wealth!B19:D29` (`=B5/Penduduk!C5*1000`) |
| original-...xlsx | Penduduk | T1 Penduduk | pdb_perkapita_rp (D5:D15) | `41915865.68` | `=+B5/C5*1000000` (shared ke bawah) | hasil formulasi | Display |
| original-...xlsx | Penduduk | T1 Penduduk | kurs_usd (E5:E15, sebagian kosong) | `10431.21 (2014)` | Statis (BI/BPS), hanya 2014-2015 terisi di dump | formula tapi input manual | `F5` |
| original-...xlsx | Penduduk | T1 Penduduk | pdb_juta_usd (F5:F15) | `1013277.01` | `=+B5/E5*1000` | hasil formulasi | `G5` |
| original-...xlsx | Penduduk | T1 Penduduk | pdb_perkapita_usd (G5:G15) | `4018.31` | `=+F5/C5*1000` | hasil formulasi | Display |
| original-...xlsx | Penduduk | T1 Penduduk | catatan_update (J3:K4) | `CATATAN / 2025-11-18 / Update data terakhir` | Teks + tanggal | input manual | -- |

### 6.12 Sheet National Wealth (A3:N43) / T1 Nilai + T2 Per kapita + T3 Penyusutan

| Nama File | Nama Sheet | Nama Tabel | Nama Variabel | Isian | Rule Pengisian | Tipe | Akan direfer oleh rumus/file apa |
|---|---|---|---|---|---|---|---|
| original-...xlsx | National Wealth | T1 Nilai aset | tahun (A5:A15) | `2014..2024**` | `A5=A6-1`; `A6='Studi PDB'!C3` dst | hasil formulasi | label |
| original-...xlsx | National Wealth | T1 Nilai aset | produced_assets (B5:B15) | `38102452.67` | `='Neraca Terpadu'!E60/K60/Q60...` | hasil formulasi | `D5` (`=B5+C5`), `E5` (`=B5/D5`), T2 `B19:B29` |
| original-...xlsx | National Wealth | T1 Nilai aset | non_produced (C5:C15) | `7533266.45` | `=SUM('Neraca Terpadu'!F61:F70)` dst | hasil formulasi | `D5`, T2 `C19:C29` |
| original-...xlsx | National Wealth | T1 Nilai aset | total_wealth (D5:D15) | `45635719.12` | `=B5+C5` | hasil formulasi | `E5/F5`, T2 `D19:D29` |
| original-...xlsx | National Wealth | T1 Nilai aset | share_produced (E5:E15) | `83.49%` | `=B5/D5` format `0%` | hasil formulasi | `F5` (`=1-E5`) |
| original-...xlsx | National Wealth | T1 Nilai aset | share_nonprod (F5:F15) | `16.50%` | `=1-E5` | hasil formulasi | Final |
| original-...xlsx | National Wealth | T2 Per kapita | produced_perkapita (B19:B29) | `151101.40` (ribu Rp) | `=B5/Penduduk!C5*1000` | hasil formulasi | `E20` growth (`=B20/B19*100-100`) |
| original-...xlsx | National Wealth | T2 Per kapita | nonprod_perkapita (C19:C29) | `29874.37` | `=C5/Penduduk!C5*1000` | hasil formulasi | `F20` |
| original-...xlsx | National Wealth | T2 Per kapita | total_perkapita (D19:D29) | `180975.78` | `=D5/Penduduk!C5*1000` | hasil formulasi | `G20` |
| original-...xlsx | National Wealth | T2 Per kapita | growth_produced (E20:E29) | `7.83%` | `=B20/B19*100-100` | hasil formulasi | Final |
| original-...xlsx | National Wealth | T2 Per kapita | growth_nonprod (F20:F29) | `-7.12%` | shared dari E20 | hasil formulasi | Final |
| original-...xlsx | National Wealth | T2 Per kapita | growth_total (G20:G29) | `5.36%` | shared dari E20 | hasil formulasi | Final |
| original-...xlsx | National Wealth | T2 Helper | konstanta_helper (M18:N18, M19, M21, N21, I19, I21:I22, K20) | `1000000000, 9, 1000, ...` | Konstanta hitung manual | input manual | dipakai rumus cek `I19=B15*1000000/281603799` dst |
| original-...xlsx | National Wealth | T3 Penyusutan | tahun2 (A33:A43) | `2014..2024**` | `=A19`, shared `A33` | hasil formulasi | label |
| original-...xlsx | National Wealth | T3 Penyusutan | cfc (B33:B43) | `1970519.41` | `='Neraca Terpadu'!C22/I22/O22...` | hasil formulasi | `D34` (`=B34/B33*100-100`) |
| original-...xlsx | National Wealth | T3 Penyusutan | deplesi (C33:C43) | `225532.93` | `='Neraca Terpadu'!C24/I24/O24...` | hasil formulasi | `E34` |
| original-...xlsx | National Wealth | T3 Penyusutan | growth_cfc (D34:D43) | `8.06%` | `=B34/B33*100-100` | hasil formulasi | Final |
| original-...xlsx | National Wealth | T3 Penyusutan | growth_deplesi (E34:E43) | `13.66%` | shared dari D34 | hasil formulasi | Final |

---

## 7. Peta referensi antar sheet (untuk urutan hitung backend)

Urutan yang aman (topological order) jika dibangun ulang di website:

```
PDB ADHB (input BPS)
 + SUT Rasio (input SUT)
   -> Penyediaan (hitung)
 + Penyusutan triwulan (input BPS triwulanan)
   -> Stok Kapital (hitung; butuh Penyediaan + Penyusutan + PDB ADHB)
 + Aset Moneter 10 komoditas (input neraca mineral)
   -> Neraca Terpadu (hitung; butuh Stok Kapital + Aset Moneter)
     -> PDB vs PDN1 T1 (hitung; butuh Neraca Terpadu)
       -> PDB vs PDN1 T2 (display; paste dari T1 -- jadikan hitung)
     -> Studi PDB (hitung; butuh Stok Kapital + PDB vs PDN1)
       -> Penduduk::tahun (header) + PDB ADHB (hitung per kapita)
       -> National Wealth T1 (hitung; butuh Neraca Terpadu)
         -> National Wealth T2/T3 (hitung; butuh T1 + Penduduk + Neraca)
Bond (F1): standalone, tidak terhubung ke F2. Jadikan modul/portofolio terpisah.
```

Dependensi kunci per variabel sudah ada di kolom "Akan direfer oleh" tiap baris di atas.

## 8. Rekomendasi skema database awal (agar tinggal implementasi)

Gunakan **long-format** + `satuan` + `status_angka`. Contoh:

- `dim_tahun(tahun INT PK, label VARCHAR(10), status ENUM('tetap','sementara','sangat_sementara'))` -- untuk `2023*`/`2024**`.
- `pdb_adhb(tahun, komponen_code, komponen_name, nilai_miliar_rp, sumber)` -- input (`formula tapi input manual`).
- `penyusutan_triwulan(tahun, triwulan, akun, nilai)` -- input.
- `sut_rasio(tahun_sut, pdb_p, top_sop, output_domestik, rasio)` -- input kecuali rasio generated.
- `penyediaan(tahun, pos, total_penyediaan, total_penggunaan, pdb)` -- generated.
- `stok_kapital(tahun, baris, k1_stok_awal, k2_penyediaan, k3_penggunaan, k4_pdb, k5_penyusutan, k6_pdn, k7_revaluasi, k8_stok_akhir)` -- generated kecuali stok_awal_2014.
- `aset_moneter(tahun, komoditas ENUM(10), unsur, nilai_miliar_rp, sumber)` -- input.
- `neraca_terpadu(tahun, komponen, kegiatan, nilai)` -- generated (view/materialized).
- `pdb_vs_pdn1(tahun, ukuran, komponen, nilai, distribusi_persen)` -- generated.
- `studi_pdb(tahun, ukuran, nilai, rasio_persen)` -- generated.
- `penduduk(tahun, pdb_miliar, penduduk_ribu, kurs, pdb_perkapita_rp, pdb_usd_juta, pdb_perkapita_usd)` -- campur input (penduduk/kurs) + generated.
- `national_wealth(tahun, jenis_aset, nilai, perkapita, growth_persen)` -- generated.
- `bond_portofolio(id, tahun, tanggal, tenor, fr, fr_persen, end_date, harga, yield, spread, par_value, kupon, helper_n, helper_o, helper_s, helper_v)` -- input.

Aturan migrasi rumus: setiap baris bertipe `hasil formulasi` = 1 fungsi/service (atau generated column); setiap `formula tapi input manual` = 1 field form impor (wajib ada validasi satuan + sumber + tahun + status angka); setiap `input manual` label = enum/master, bukan angka.

## 9. Batasan dan langkah lanjut

- File ini adalah **identifikasi level variabel (kolom logis)**, bukan dump per-cell (ribuan cell). Jika butuh audit per-cell (alamat A1 dst + cached result), saya bisa generate lampiran CSV dari dump `ExcelJS` yang sudah ada.
- Nilai contoh (`Isian`) diambil dari tahun 2014 (kolom pertama) agar konsisten; tahun lain polanya sama, tinggal geser kolom.
- Perlu keputusan: `Penyusutan GNP/Pendapatan Nasional` dan `Aset Moneter total/closing` yang saat ini paste-values -- di website dijadikan rumus (rekomendasi saya: YA).
- Perlu konfirmasi mapping tahun SUT: 2014->SUT2010, 2015-2018->SUT2016, 2019->SUT2019, 2020->SUT2020, 2021-2024->SUT2021 (dari rumus `$B$5/$C$5/$D$5/$E$5/$F$5` di `Penyediaan`). Jika SUT baru terbit, mapping ini harus jadi parameter, bukan hardcode.
