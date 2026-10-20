import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE

def create_bps_presentation():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    # Palet Warna Profesional BPS (Navy Slate, BPS Blue, Emerald Green, Amber)
    C_BG_DARK = RGBColor(15, 23, 42)      # #0f172a
    C_CARD_BG = RGBColor(30, 41, 59)      # #1e293b
    C_EMERALD = RGBColor(16, 185, 129)    # #10b981
    C_BLUE = RGBColor(59, 130, 246)       # #3b82f6
    C_AMBER = RGBColor(245, 158, 11)      # #f59e0b
    C_WHITE = RGBColor(255, 255, 255)
    C_GRAY_LIGHT = RGBColor(226, 232, 240)# #e2e8f0
    C_GRAY_MUTED = RGBColor(148, 163, 184)# #94a3b8

    def add_slide_bg(slide):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
        bg.fill.solid()
        bg.fill.fore_color.rgb = C_BG_DARK
        bg.line.fill.background()
        return bg

    def add_header(slide, title_text, category_text="BADAN PUSAT STATISTIK — SISTEM INFORMASI NERACA LINGKUNGAN"):
        cat_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(10.5), Inches(0.35))
        tf_c = cat_box.text_frame
        tf_c.word_wrap = True
        p_c = tf_c.paragraphs[0]
        p_c.text = category_text.upper()
        p_c.font.size = Pt(11)
        p_c.font.bold = True
        p_c.font.color.rgb = C_EMERALD

        title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.75), Inches(11.8), Inches(0.8))
        tf_t = title_box.text_frame
        tf_t.word_wrap = True
        p_t = tf_t.paragraphs[0]
        p_t.text = title_text
        p_t.font.size = Pt(24)
        p_t.font.bold = True
        p_t.font.color.rgb = C_WHITE

    def add_card(slide, left, top, width, height, bg_color=C_CARD_BG, border_color=None):
        shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
        shape.fill.solid()
        shape.fill.fore_color.rgb = bg_color
        if border_color:
            shape.line.color.rgb = border_color
            shape.line.width = Pt(1.5)
        else:
            shape.line.fill.background()
        return shape

    def set_speaker_notes(slide, notes_text):
        notes_slide = slide.notes_slide
        tf = notes_slide.notes_text_frame
        tf.text = notes_text

    # ==========================================
    # SLIDE 1: JUDUL UTAMA (SESUAI JUDUL BPS)
    # ==========================================
    s1 = prs.slides.add_slide(blank_layout)
    add_slide_bg(s1)

    bar1 = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.2), Inches(1.5), Inches(2.2), Inches(0.12))
    bar1.fill.solid()
    bar1.fill.fore_color.rgb = C_EMERALD
    bar1.line.fill.background()

    tb1 = s1.shapes.add_textbox(Inches(1.2), Inches(1.75), Inches(11.0), Inches(5.0))
    tf1 = tb1.text_frame
    tf1.word_wrap = True

    p_badge = tf1.paragraphs[0]
    p_badge.text = "BADAN PUSAT STATISTIK — INOVASI SISTEM INFORMASI STATISTIK LINGKUNGAN"
    p_badge.font.size = Pt(12)
    p_badge.font.bold = True
    p_badge.font.color.rgb = C_EMERALD
    p_badge.space_after = Pt(10)

    p_main = tf1.add_paragraph()
    p_main.text = "SISNERLING"
    p_main.font.size = Pt(44)
    p_main.font.bold = True
    p_main.font.color.rgb = C_WHITE
    p_main.space_after = Pt(8)

    p_sub = tf1.add_paragraph()
    p_sub.text = "Rancang Bangun Sistem Informasi Pengolahan Data dan Kalkulasi Dinamis Neraca Lingkungan (SISNERLING) Berbasis Web pada Instansi Badan Pusat Statistik"
    p_sub.font.size = Pt(18)
    p_sub.font.bold = True
    p_sub.font.color.rgb = C_BLUE
    p_sub.space_after = Pt(14)

    p_tag = tf1.add_paragraph()
    p_tag.text = "Digitalisasi Siklus Pengolahan Neraca Sumber Daya Alam, Mesin Kalkulasi Dinamis, Validasi Berjenjang, dan Otomatisasi Terintegrasi"
    p_tag.font.size = Pt(14)
    p_tag.font.color.rgb = C_GRAY_LIGHT
    p_tag.space_after = Pt(14)

    p_desc = tf1.add_paragraph()
    p_desc.text = "Pemaparan Menyeluruh: Konteks Statistik Lingkungan BPS, Alur Kerja Web, Arsitektur Sistem, Rule Engine, dan Implementasi Neraca Hutan & Timber."
    p_desc.font.size = Pt(12.5)
    p_desc.font.color.rgb = C_GRAY_MUTED

    set_speaker_notes(s1,
        "CATATAN PRESENTER:\n"
        "Selamat pagi/siang bapak/ibu sekalian. Pada kesempatan ini saya ingin memaparkan karya sistem informasi: Rancang Bangun Sistem Informasi Pengolahan Data dan Kalkulasi Dinamis Neraca Lingkungan (SISNERLING) Berbasis Web pada instansi Badan Pusat Statistik. "
        "Sistem ini dirancang khusus untuk memenuhi kebutuhan BPS dalam menyusun neraca sumber daya alam dan lingkungan secara modern, akurat, dan terintegrasi—menggantikan metode spreadsheet manual yang rentan kendala teknis."
    )

    # ==========================================
    # SLIDE 2: LATAR BELAKANG & PERMASALAHAN DI BPS
    # ==========================================
    s2 = prs.slides.add_slide(blank_layout)
    add_slide_bg(s2)
    add_header(s2, "Latar Belakang & Masalah Pengolahan Neraca di BPS")

    problems = [
        ("01", "Data Tercecer & Desentralisasi", 
         "Penyusunan neraca lingkungan di BPS sebelumnya tersebar di puluhan berkas Excel lokal antar-seksi. Sulit mengontrol versi data termutakhir dan berisiko tinggi saat terjadi mutasi tim/staf penyusun."),
        ("02", "Rekapitulasi Manual Lambat", 
         "Proses kompilasi dan konsolidasi data dari survei penunjang (kebakaran, reboisasi, produksi kayu) membutuhkan penyalinan manual bertahap yang memakan waktu berminggu-minggu hingga berbulan-bulan."),
        ("03", "Formula Rapuh & Inkonsistensi", 
         "Ketergantungan rumus Excel lintas-sheet dan lintas-file kerap menimbulkan error (#REF!, #VALUE!). Ketiadaan validasi otomatis dan lock cell sering memicu selisih angka saat publikasi statistik.")
    ]

    for i, (num, p_title, p_desc) in enumerate(problems):
        left = Inches(0.8 + i * 4.0)
        top = Inches(1.8)
        w = Inches(3.6)
        h = Inches(4.8)
        add_card(s2, left, top, w, h, C_CARD_BG, border_color=C_AMBER if i==2 else None)

        tb = s2.shapes.add_textbox(left + Inches(0.25), top + Inches(0.3), w - Inches(0.5), h - Inches(0.6))
        tf = tb.text_frame
        tf.word_wrap = True

        p_num = tf.paragraphs[0]
        p_num.text = f"KENDALA {num}"
        p_num.font.size = Pt(11)
        p_num.font.bold = True
        p_num.font.color.rgb = C_AMBER
        p_num.space_after = Pt(12)

        p_t = tf.add_paragraph()
        p_t.text = p_title
        p_t.font.size = Pt(18)
        p_t.font.bold = True
        p_t.font.color.rgb = C_WHITE
        p_t.space_after = Pt(14)

        p_d = tf.add_paragraph()
        p_d.text = p_desc
        p_d.font.size = Pt(13)
        p_d.font.color.rgb = C_GRAY_LIGHT

    set_speaker_notes(s2,
        "CATATAN PRESENTER:\n"
        "Mengapa sistem ini dibutuhkan di BPS? Dalam penyusunan neraca lingkungan, tim statistik menghadapi tiga masalah utama:\n"
        "1. Data survei dan neraca tercecer di komputer staf masing-masing tanpa satu basis data terpusat.\n"
        "2. Rekapitulasi tahunan memakan waktu sangat panjang karena harus mencocokkan puluhan file Excel yang saling tertaut.\n"
        "3. Kerentanan rumus formula Excel yang sering error saat file berpindah folder, sehingga berpotensi menimbulkan inkonsistensi data publikasi."
    )

    # ==========================================
    # SLIDE 3: SOLUSI & PENGENALAN SISTEM SISNERLING
    # ==========================================
    s3 = prs.slides.add_slide(blank_layout)
    add_slide_bg(s3)
    add_header(s3, "Solusi: Pengenalan SISNERLING di Lingkungan BPS")

    add_card(s3, Inches(0.8), Inches(1.8), Inches(5.6), Inches(4.8), C_CARD_BG, border_color=C_EMERALD)
    tb_l = s3.shapes.add_textbox(Inches(1.1), Inches(2.1), Inches(5.0), Inches(4.2))
    tf_l = tb_l.text_frame
    tf_l.word_wrap = True
    p_lt = tf_l.paragraphs[0]
    p_lt.text = "Apa itu SISNERLING?"
    p_lt.font.size = Pt(19)
    p_lt.font.bold = True
    p_lt.font.color.rgb = C_EMERALD
    p_lt.space_after = Pt(12)

    l_items = [
        "Purwarupa (Prototype) aplikasi web yang dirancang untuk menginput, memvalidasi, merekapitulasi, dan mengkalkulasi neraca lingkungan secara berkala.",
        "Mengadopsi antarmuka spreadsheet interaktif yang akrab bagi fungsional statistisi, didukung basis data terpusat yang aman.",
        "Menyediakan mesin kalkulasi dinamis (neracaFormula Engine) yang menghitung fisik dan moneter secara otomatis.",
        "Mendukung multi-sektor: Neraca Hutan, Neraca Mineral, Energi, dan Neraca Terintegrasi (System of Environmental-Economic Accounting / SEEA)."
    ]
    for it in l_items:
        p = tf_l.add_paragraph()
        p.text = f"✔  {it}"
        p.font.size = Pt(12.5)
        p.font.color.rgb = C_GRAY_LIGHT
        p.space_after = Pt(8)

    add_card(s3, Inches(6.9), Inches(1.8), Inches(5.6), Inches(4.8), C_CARD_BG, border_color=C_BLUE)
    tb_r = s3.shapes.add_textbox(Inches(7.2), Inches(2.1), Inches(5.0), Inches(4.2))
    tf_r = tb_r.text_frame
    tf_r.word_wrap = True
    p_rt = tf_r.paragraphs[0]
    p_rt.text = "Tujuan & Sasaran Strategis"
    p_rt.font.size = Pt(19)
    p_rt.font.bold = True
    p_rt.font.color.rgb = C_BLUE
    p_rt.space_after = Pt(12)

    r_items = [
        "Digitalisasi Penuh Siklus Neraca: Mengeliminasi ketergantungan berkas Excel lokal menjadi platform cloud terpusat.",
        "Single Source of Truth: Menjamin satu rujukan data neraca terpusat yang konsisten bagi seluruh kedeputian dan seksi di BPS.",
        "Kalkulasi Dinamis Terstandar: Menerapkan rumus baku SEEA PBB tanpa deviasi akibat kesalahan pengetikan rumus.",
        "Akuntabilitas & Audit Trail: Mencatat riwayat setiap perubahan angka statistik secara transparan dan siap diaudit."
    ]
    for it in r_items:
        p = tf_r.add_paragraph()
        p.text = f"★  {it}"
        p.font.size = Pt(12.5)
        p.font.color.rgb = C_GRAY_LIGHT
        p.space_after = Pt(8)

    set_speaker_notes(s3,
        "CATATAN PRESENTER:\n"
        "SISNERLING hadir sebagai jawaban atas permasalahan tersebut. Sistem ini membawa seluruh proses penyusunan neraca lingkungan ke web. "
        "Tujuannya adalah menciptakan satu sumber kebenaran data (Single Source of Truth) di BPS, memastikan metodologi SEEA berjalan otomatis, dan membebaskan statistisi dari pekerjaan manual yang repetitif."
    )

    # ==========================================
    # SLIDE 4: FITUR UTAMA SISTEM WEB BPS
    # ==========================================
    s4 = prs.slides.add_slide(blank_layout)
    add_slide_bg(s4)
    add_header(s4, "Fitur-Fitur Utama Sistem Aplikasi Web SISNERLING")

    features = [
        ("1. Manajemen Hak Akses Multi-Role", 
         "Pemisahan peran berjenjang: User (Auditor/Viewer mode hanya-lihat), Admin/Operator (entri data sesuai batas penugasan tabel), dan Super Admin (kontrol penuh akun, backup, dan maintenance)."),
        ("2. Form Input & Pengolahan Neraca Dinamis", 
         "Halaman khusus input neraca deret waktu (Jati Jawa, Rimba Jawa, Luar Jawa, Indonesia) dengan auto-calculation instan persediaan awal, deplesi, reboisasi, saldo akhir, dan valuasi moneter."),
        ("3. Statistical Spreadsheet & Excel Import", 
         "Editor spreadsheet interaktif berbasis browser dengan formula evaluator lengkap, import berkas .xlsx instan, penataan kategori neraca, dan proteksi penguncian sel (cell-level lock)."),
        ("4. Dashboard Analytics & Export Laporan", 
         "Visualisasi tren data deret waktu tahunan, pemantauan saldo neraca lingkungan, serta fitur export laporan instan ke format Excel dan PDF terstandar.")
    ]

    for i, (ft, fd) in enumerate(features):
        row = i // 2
        col = i % 2
        left = Inches(0.8 + col * 5.9)
        top = Inches(1.8 + row * 2.5)
        w = Inches(5.6)
        h = Inches(2.25)

        add_card(s4, left, top, w, h, C_CARD_BG)
        tb = s4.shapes.add_textbox(left + Inches(0.25), top + Inches(0.2), w - Inches(0.5), h - Inches(0.4))
        tf = tb.text_frame
        tf.word_wrap = True

        p1 = tf.paragraphs[0]
        p1.text = ft
        p1.font.size = Pt(16)
        p1.font.bold = True
        p1.font.color.rgb = C_EMERALD
        p1.space_after = Pt(8)

        p2 = tf.add_paragraph()
        p2.text = fd
        p2.font.size = Pt(12)
        p2.font.color.rgb = C_GRAY_LIGHT

    set_speaker_notes(s4,
        "CATATAN PRESENTER:\n"
        "SISNERLING dilengkapi dengan fitur unggulan yang dirancang spesifik untuk operasional statistik:\n"
        "1. Manajemen Role berjenjang (User, Admin Penugasan, Super Admin).\n"
        "2. Form Input Pengolahan Neraca dengan kalkulasi otomatis antar-sheet deret waktu.\n"
        "3. Statistical Spreadsheet lengkap dengan kemampuan import Excel langsung.\n"
        "4. Dashboard Analytics dan Export Laporan terstandar siap pakai."
    )

    # ==========================================
    # SLIDE 5: ALUR KERJA SISTEM (WORKFLOW OPERASIONAL BPS)
    # ==========================================
    s5 = prs.slides.add_slide(blank_layout)
    add_slide_bg(s5)
    add_header(s5, "Alur Kerja Sistem (Workflow Operasional di BPS)")

    steps = [
        ("TAHAP 01", "Login & Otorisasi", "Statistisi/Operator login dengan autentikasi aman, mengakses sheet sesuai penugasan tabel dari Super Admin."),
        ("TAHAP 02", "Input Data Tahunan", "Menginput data fisik (pertumbuhan, penanaman, penebangan) dan parameter ekonomi pada form spreadsheet interaktif."),
        ("TAHAP 03", "Kalkulasi Dinamis", "Engine otomatis menghitung perubahan neto, saldo akhir fisik, unit rent, dan valuasi moneter hingga agregasi nasional."),
        ("TAHAP 04", "Validasi Berjenjang", "Penanggung jawab/Validator memeriksa kewajaran angka statistik, status sel, dan konsistensi lintas seksi."),
        ("TAHAP 05", "Diseminasi & Publikasi", "Data neraca yang telah tervalidasi dapat dipantau pada Dashboard Analytics dan diekspor ke draf laporan publikasi BPS.")
    ]

    step_w = Inches(2.25)
    step_h = Inches(4.8)
    step_top = Inches(1.8)

    for i, (stg, st_title, st_desc) in enumerate(steps):
        left = Inches(0.8 + i * 2.45)
        border = C_EMERALD if i == 2 else (C_BLUE if i == 4 else None)
        add_card(s5, left, step_top, step_w, step_h, C_CARD_BG, border_color=border)

        tb = s5.shapes.add_textbox(left + Inches(0.15), step_top + Inches(0.25), step_w - Inches(0.3), step_h - Inches(0.5))
        tf = tb.text_frame
        tf.word_wrap = True

        p0 = tf.paragraphs[0]
        p0.text = stg
        p0.font.size = Pt(11)
        p0.font.bold = True
        p0.font.color.rgb = C_AMBER
        p0.space_after = Pt(10)

        p1 = tf.add_paragraph()
        p1.text = st_title
        p1.font.size = Pt(15)
        p1.font.bold = True
        p1.font.color.rgb = C_WHITE
        p1.space_after = Pt(12)

        p2 = tf.add_paragraph()
        p2.text = st_desc
        p2.font.size = Pt(12)
        p2.font.color.rgb = C_GRAY_LIGHT

    set_speaker_notes(s5,
        "CATATAN PRESENTER:\n"
        "Alur kerja pengolahan di SISNERLING sangat runtut dan terkontrol:\n"
        "Mulai dari login berbasis penugasan pengguna, pengisian data fisik dan ekonomi, eksekusi kalkulasi dinamis secara otomatis, "
        "proses penelaahan dan validasi oleh penanggung jawab, hingga data dikunci dan siap dipublikasikan ke publik dan pemangku kebijakan."
    )

    # ==========================================
    # SLIDE 6: ARSITEKTUR TEKNOLOGI
    # ==========================================
    s6 = prs.slides.add_slide(blank_layout)
    add_slide_bg(s6)
    add_header(s6, "Arsitektur Sistem & Tumpukan Teknologi (Tech Stack)")

    tech_cols = [
        ("Frontend Application", "React + Vite (SPA)", [
            "Vanilla CSS modern: performa tinggi tanpa bloatware",
            "Custom Spreadsheet Grid & Interactive Sheet Tabs",
            "Dashboard Tren Deret Waktu & Filter Fleksibel",
            "Koneksi WebSocket real-time untuk kolaborasi"
        ]),
        ("Backend Services", "Node.js + Express.js", [
            "RESTful API modular & arsitektur event-driven",
            "Mesin Neraca Formula Dinamis (neracaFormula.js)",
            "Autentikasi JWT, Scope Assignment, & Audit Log",
            "Excel Import/Export Streaming Parser (.xlsx)"
        ]),
        ("Basis Data & Komunikasi", "MySQL + WebSocket", [
            "Skema Long-Format ternormalisasi + Metadata",
            "Transaksi ACID menjamin integritas angka neraca",
            "Real-time Collaboration & Cell-Level Locking",
            "Sistem Backup & Restore database terintegrasi"
        ])
    ]

    for i, (t_title, t_sub, t_items) in enumerate(tech_cols):
        left = Inches(0.8 + i * 4.0)
        top = Inches(1.8)
        w = Inches(3.6)
        h = Inches(4.8)
        add_card(s6, left, top, w, h, C_CARD_BG)

        tb = s6.shapes.add_textbox(left + Inches(0.25), top + Inches(0.3), w - Inches(0.5), h - Inches(0.6))
        tf = tb.text_frame
        tf.word_wrap = True

        p_head = tf.paragraphs[0]
        p_head.text = t_title
        p_head.font.size = Pt(16)
        p_head.font.bold = True
        p_head.font.color.rgb = C_WHITE

        p_sub = tf.add_paragraph()
        p_sub.text = t_sub
        p_sub.font.size = Pt(12)
        p_sub.font.bold = True
        p_sub.font.color.rgb = C_BLUE
        p_sub.space_after = Pt(14)

        for it in t_items:
            p_it = tf.add_paragraph()
            p_it.text = f"•  {it}"
            p_it.font.size = Pt(12)
            p_it.font.color.rgb = C_GRAY_LIGHT
            p_it.space_after = Pt(6)

    set_speaker_notes(s6,
        "CATATAN PRESENTER:\n"
        "SISNERLING dibangun dengan standar arsitektur perangkat lunak modern:\n"
        "Frontend menggunakan React dan Vite untuk antarmuka yang sangat responsif saat memuat ribuan sel.\n"
        "Backend Node.js mengeksekusi logika kalkulasi neraca secara cepat.\n"
        "Dan basis data MySQL dengan skema long-format menjamin konsistensi dan skalabilitas penyimpanan data tahunan BPS."
    )

    # ==========================================
    # SLIDE 7: MESIN KALKULASI DINAMIS & DUAL-LAYER DATA
    # ==========================================
    s7 = prs.slides.add_slide(blank_layout)
    add_slide_bg(s7)
    add_header(s7, "Kalkulasi Dinamis & Inovasi Dual-Layer Data")

    add_card(s7, Inches(0.8), Inches(1.8), Inches(5.6), Inches(4.8), C_CARD_BG, border_color=C_EMERALD)
    tb_l = s7.shapes.add_textbox(Inches(1.1), Inches(2.1), Inches(5.0), Inches(4.2))
    tf_l = tb_l.text_frame
    tf_l.word_wrap = True
    p_lt = tf_l.paragraphs[0]
    p_lt.text = "Mesin Kalkulasi Dinamis (DAG Engine)"
    p_lt.font.size = Pt(17)
    p_lt.font.bold = True
    p_lt.font.color.rgb = C_EMERALD
    p_lt.space_after = Pt(12)

    l_items = [
        "Evaluasi Rumus Otomatis: Menghitung persediaan awal tahun berjalan dari saldo akhir tahun sebelumnya secara berantai.",
        "Keterkaitan Antar-Variabel: Perubahan neto fisik langsung mengalir ke perhitungan neraca moneter dan revaluasi harga sewa.",
        "Konsolidasi Otomatis Nasional: Data wilayah (Jati Jawa, Rimba Jawa, Luar Jawa) secara dinamis diagregasikan ke sheet Indonesia.",
        "Directed Acyclic Graph (DAG): Mencegah kesalahan sirkular (circular reference) dan memastikan urutan perhitungan presisi."
    ]
    for it in l_items:
        p = tf_l.add_paragraph()
        p.text = f"✔ {it}"
        p.font.size = Pt(12.5)
        p.font.color.rgb = C_GRAY_LIGHT
        p.space_after = Pt(8)

    add_card(s7, Inches(6.9), Inches(1.8), Inches(5.6), Inches(4.8), C_CARD_BG, border_color=C_BLUE)
    tb_r = s7.shapes.add_textbox(Inches(7.2), Inches(2.1), Inches(5.0), Inches(4.2))
    tf_r = tb_r.text_frame
    tf_r.word_wrap = True
    p_rt = tf_r.paragraphs[0]
    p_rt.text = "Pemisahan Lapis Logis vs Lapis Visual"
    p_rt.font.size = Pt(17)
    p_rt.font.bold = True
    p_rt.font.color.rgb = C_BLUE
    p_rt.space_after = Pt(12)

    r_items = [
        "Lapis Logis (Database Truth): Normalisasi nilai_variabel(variabel, tahun) menghindari pembuatan puluhan tabel kaku.",
        "Lapis Visual (Spreadsheet Grid): Mempertahankan tampilan format tabular, merge cell, dan warna kategori yang sudah akrab bagi statistisi.",
        "Zero-Loss Format: Data yang diolah dapat diekspor kembali menjadi format laporan dan template format laporan publikasi BPS.",
        "Fleksibel untuk Komoditas Baru: Skema database dapat langsung menampung neraca sumber daya alam lainnya tanpa rombak tabel."
    ]
    for it in r_items:
        p = tf_r.add_paragraph()
        p.text = f"✔ {it}"
        p.font.size = Pt(12.5)
        p.font.color.rgb = C_GRAY_LIGHT
        p.space_after = Pt(8)

    set_speaker_notes(s7,
        "CATATAN PRESENTER:\n"
        "Inovasi kunci pada sistem ini adalah Kalkulasi Dinamis berbasis DAG dan arsitektur Dual-Layer:\n"
        "Sistem memisahkan antara logika data di database dengan representasi visual di layar. "
        "Saat operator mengubah satu angka di tahun 2020, sistem secara dinamis mengalirkan perubahannya ke tahun-tahun berikutnya dan ke neraca moneter secara instan tanpa perlu menjalankan macro manual."
    )

    # ==========================================
    # SLIDE 8: IMPLEMENTASI STUDI KASUS (NERACA HUTAN & TIMBER BPS)
    # ==========================================
    s8 = prs.slides.add_slide(blank_layout)
    add_slide_bg(s8)
    add_header(s8, "Implementasi: Neraca Hutan & Neraca Kayu (Timber)")

    modules = [
        ("Neraca Fisik (Volume & Luas)", 
         "Pencatatan volume tegakan kayu (m³) dan tutupan lahan (Ha) per tahun: saldo awal, penambahan alami, reboisasi, penebangan, kebakaran hutan, hingga saldo akhir."),
        ("Unit Rent & Neraca Moneter", 
         "Perhitungan sewa ekonomi sumber daya (resource rent) per m³, biaya eksploitasi, valuasi moneter rupiah, nilai deplesi ekonomi, dan revaluasi aset hutan."),
        ("Segmentasi Wilayah & Komoditas", 
         "Pemilahan struktur tabel neraca: Jati Jawa, Rimba Jawa, Rimba Luar Jawa, dan sheet agregasi Rekapitulasi Nasional (Indonesia)."),
        ("Standardisasi ~1.992 Variabel", 
         "Klasifikasi terstruktur: ~48% variabel input manual, ~51% kalkulasi otomatis dinamis, dan ~1% parameter acuan eksternal (KLHK/Perhutani/Harga Pasar).")
    ]

    for i, (mt, md) in enumerate(modules):
        left = Inches(0.8 + i * 2.95)
        top = Inches(1.8)
        w = Inches(2.75)
        h = Inches(4.8)
        add_card(s8, left, top, w, h, C_CARD_BG)

        tb = s8.shapes.add_textbox(left + Inches(0.2), top + Inches(0.25), w - Inches(0.4), h - Inches(0.5))
        tf = tb.text_frame
        tf.word_wrap = True

        p1 = tf.paragraphs[0]
        p1.text = mt
        p1.font.size = Pt(15)
        p1.font.bold = True
        p1.font.color.rgb = C_AMBER
        p1.space_after = Pt(10)

        p2 = tf.add_paragraph()
        p2.text = md
        p2.font.size = Pt(12)
        p2.font.color.rgb = C_GRAY_LIGHT

    set_speaker_notes(s8,
        "CATATAN PRESENTER:\n"
        "Implementasi riil dari rancang bangun ini telah diterapkan pada modul Neraca Hutan dan Neraca Kayu (Timber) BPS. "
        "Sistem berhasil mendigitalkan 1.992 variabel dari puluhan sheet Excel lama ke dalam sistem web: memisahkan persediaan fisik m³, sewa ekonomi, hingga neraca moneter nasional secara otomatis."
    )

    # ==========================================
    # SLIDE 9: NILAI MANFAAT BAGI BPS & STAKEHOLDER
    # ==========================================
    s9 = prs.slides.add_slide(blank_layout)
    add_slide_bg(s9)
    add_header(s9, "Nilai Manfaat & Dampak Strategis bagi BPS")

    benefits = [
        ("Akurasi Data Terstandar SEEA", 
         "Meniadakan risiko human error dan kesalahan rumus Excel lokal; seluruh kalkulasi mengacu pada standar baku akuntansi lingkungan internasional."),
        ("Efisiensi Waktu Pengolahan 85%+", 
         "Memangkas waktu siklus konsolidasi dan rekapitulasi data dari hitungan minggu menjadi instan dalam hitungan detik setelah data dasar tervalidasi."),
        ("Tata Kelola & Audit Trail Andal", 
         "Setiap entri dan modifikasi angka statistik terekam dalam log audit transparan (siapa, kapan, dan nilai sebelum-sesudah) untuk keandalan data statistik."),
        ("Single Source of Truth Nasional", 
         "Menyediakan satu-satunya basis data neraca lingkungan terpusat untuk kebutuhan BPS yang siap diintegrasikan untuk kebutuhan publikasi dan kebijakan lintas kementerian.")
    ]

    for i, (bt, bd) in enumerate(benefits):
        row = i // 2
        col = i % 2
        left = Inches(0.8 + col * 5.9)
        top = Inches(1.8 + row * 2.5)
        w = Inches(5.6)
        h = Inches(2.25)

        add_card(s9, left, top, w, h, C_CARD_BG, border_color=C_BLUE if (i%2==1) else C_EMERALD)
        tb = s9.shapes.add_textbox(left + Inches(0.25), top + Inches(0.2), w - Inches(0.5), h - Inches(0.4))
        tf = tb.text_frame
        tf.word_wrap = True

        p1 = tf.paragraphs[0]
        p1.text = f"★  {bt}"
        p1.font.size = Pt(17)
        p1.font.bold = True
        p1.font.color.rgb = C_WHITE
        p1.space_after = Pt(8)

        p2 = tf.add_paragraph()
        p2.text = bd
        p2.font.size = Pt(13)
        p2.font.color.rgb = C_GRAY_LIGHT

    set_speaker_notes(s9,
        "CATATAN PRESENTER:\n"
        "Manfaat yang dirasakan instansi BPS sangat nyata:\n"
        "1. Akurasi data terjamin sesuai standar SEEA.\n"
        "2. Efisiensi waktu pengolahan melonjak signifikan karena eliminasi proses manual.\n"
        "3. Memiliki audit trail lengkap untuk menjamin integritas statistik.\n"
        "4. Menjadi Single Source of Truth yang memudahkan penyediaan data bagi kementerian dan lembaga pengguna."
    )

    # ==========================================
    # SLIDE 10: KESIMPULAN & ROADMAP PENGEMBANGAN BPS
    # ==========================================
    s10 = prs.slides.add_slide(blank_layout)
    add_slide_bg(s10)
    add_header(s10, "Kesimpulan & Rencana Pengembangan Masa Depan (Roadmap)")

    add_card(s10, Inches(0.8), Inches(1.8), Inches(5.6), Inches(4.8), C_CARD_BG, border_color=C_EMERALD)
    tb_c = s10.shapes.add_textbox(Inches(1.1), Inches(2.1), Inches(5.0), Inches(4.2))
    tf_c = tb_c.text_frame
    tf_c.word_wrap = True
    p_ct = tf_c.paragraphs[0]
    p_ct.text = "Kesimpulan Rancang Bangun"
    p_ct.font.size = Pt(19)
    p_ct.font.bold = True
    p_ct.font.color.rgb = C_EMERALD
    p_ct.space_after = Pt(12)

    c_points = [
        "SISNERLING berhasil mentransformasikan penyusunan neraca lingkungan di BPS menjadi sistem berbasis web yang modern, cepat, dan akuntabel.",
        "Mesin kalkulasi dinamis dan validasi berjenjang mampu menggantikan proses manual yang rentan kendala teknis.",
        "Sistem telah teruji handal dalam mengolah ribuan variabel pada modul Neraca Hutan dan Neraca Kayu (Timber)."
    ]
    for cp in c_points:
        p = tf_c.add_paragraph()
        p.text = f"✔  {cp}"
        p.font.size = Pt(12.5)
        p.font.color.rgb = C_GRAY_LIGHT
        p.space_after = Pt(10)

    add_card(s10, Inches(6.9), Inches(1.8), Inches(5.6), Inches(4.8), C_CARD_BG, border_color=C_AMBER)
    tb_rm = s10.shapes.add_textbox(Inches(7.2), Inches(2.1), Inches(5.0), Inches(4.2))
    tf_rm = tb_rm.text_frame
    tf_rm.word_wrap = True
    p_rmt = tf_rm.paragraphs[0]
    p_rmt.text = "Roadmap Pengembangan BPS"
    p_rmt.font.size = Pt(19)
    p_rmt.font.bold = True
    p_rmt.font.color.rgb = C_AMBER
    p_rmt.space_after = Pt(12)

    rm_points = [
        "Interoperabilitas API BPS & K/L: Integrasi data langsung dengan Kementerian Lingkungan Hidup dan Kehutanan (KLHK) dan Kementerian ESDM.",
        "Perluasan Domain Neraca: Pengembangan modul Neraca Mineral, Neraca Energi, Neraca Air, serta Neraca Emisi Gas Rumah Kaca (GRK).",
        "Deteksi Anomali Statistik Cerdas: Notifikasi dini terhadap lonjakan deplesi sumber daya alam atau ketidakwajaran angka input.",
        "Dashboard Publik Eksekutif: Portal diseminasi ringkas berbasis web dan mobile untuk pimpinan lembaga dan publik."
    ]
    for rp in rm_points:
        p = tf_rm.add_paragraph()
        p.text = f"🚀  {rp}"
        p.font.size = Pt(12.5)
        p.font.color.rgb = C_GRAY_LIGHT
        p.space_after = Pt(8)

    set_speaker_notes(s10,
        "CATATAN PRESENTER:\n"
        "Sebagai penutup, SISNERLING adalah inovasi strategis yang memodernisasi cara BPS mengolah statistik neraca lingkungan hidup. "
        "Roadmap ke depan akan menghubungkan sistem ini langsung dengan API kementerian sektoral, memperluas cakupan ke neraca mineral, energi, dan air, serta menghadirkan analitik pintar untuk mendukung perumusan kebijakan pembangunan berkelanjutan. "
        "Terima kasih atas perhatian bapak/ibu sekalian, saya membuka sesi diskusi dan tanya jawab."
    )

    out_file = r"c:\laragon\www\sisnerling\Sisnerling\_dokumen\Presentasi_SISNERLING.pptx"
    prs.save(out_file)
    print(f"BPS Master presentation successfully saved to: {out_file}")

if __name__ == "__main__":
    create_bps_presentation()
