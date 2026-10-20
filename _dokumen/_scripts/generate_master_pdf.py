import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 9)
        self.setFillColor(colors.HexColor("#64748b"))
        
        # Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(54, 800, "BADAN PUSAT STATISTIK — Rancang Bangun SISNERLING Berbasis Web")
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(54, 792, 541, 792)

        # Footer
        footer_text = f"Halaman {self._pageNumber} dari {page_count}"
        self.drawRightString(541, 35, footer_text)
        self.drawString(54, 35, "Dokumen Rancang Bangun & Presentasi Sistem: SISNERLING (BPS)")
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(54, 48, 541, 48)

        self.restoreState()

def build_pdf(filename):
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#0f172a'),
        spaceAfter=4
    )

    subtitle_style = ParagraphStyle(
        'DocSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#059669'),
        spaceAfter=12
    )

    slide_badge = ParagraphStyle(
        'SlideBadge',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#2563eb'),
        spaceBefore=10,
        spaceAfter=2,
        keepWithNext=True
    )

    slide_title = ParagraphStyle(
        'SlideTitle',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#0f172a'),
        spaceBefore=0,
        spaceAfter=5,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor('#334155'),
        spaceAfter=3
    )

    bullet_style = ParagraphStyle(
        'Bullet',
        parent=body_style,
        leftIndent=14,
        firstLineIndent=-10,
        spaceAfter=2.5
    )

    notes_box = ParagraphStyle(
        'Notes',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8,
        leading=11.5,
        textColor=colors.HexColor('#1e293b')
    )

    story = []

    # Title
    story.append(Paragraph("RANCANG BANGUN SISTEM INFORMASI PENGOLAHAN DATA DAN KALKULASI DINAMIS NERACA LINGKUNGAN (SISNERLING) BERBASIS WEB PADA INSTANSI BADAN PUSAT STATISTIK", title_style))
    story.append(Paragraph("Dokumen Slide Deck & Catatan Presenter (Speaker Notes) Lengkap", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#059669"), spaceBefore=0, spaceAfter=8))

    slides = [
        {
            "num": "SLIDE 1",
            "title": "Rancang Bangun Sistem Informasi Pengolahan Data dan Kalkulasi Dinamis Neraca Lingkungan (SISNERLING) Berbasis Web pada Instansi Badan Pusat Statistik",
            "bullets": [
                "<b>Konteks Instansi:</b> Badan Pusat Statistik (BPS) — Modernisasi & digitalisasi pengolahan data statistik lingkungan hidup.",
                "<b>Platform Web Terpadu:</b> Digitalisasi penuh siklus pencatatan, validasi berjenjang, dan rekapitulasi neraca sumber daya alam.",
                "<b>Kalkulasi Dinamis:</b> Mesin kalkulasi otomatis (neracaFormula Engine & DAG) yang menggantikan formula Excel manual.",
                "<b>Cakupan Pemaparan:</b> Menggabungkan alur kerja operasional web BPS, arsitektur sistem, dan implementasi modul Neraca Hutan & Timber."
            ],
            "notes": "Selamat pagi/siang bapak/ibu sekalian. Pada kesempatan ini saya ingin memaparkan karya sistem informasi: Rancang Bangun Sistem Informasi Pengolahan Data dan Kalkulasi Dinamis Neraca Lingkungan (SISNERLING) Berbasis Web pada instansi Badan Pusat Statistik. Sistem ini dirancang khusus untuk memenuhi kebutuhan BPS dalam menyusun neraca sumber daya alam dan lingkungan secara modern, akurat, dan terintegrasi—menggantikan metode spreadsheet manual yang rentan kendala teknis."
        },
        {
            "num": "SLIDE 2",
            "title": "Latar Belakang & Masalah Pengolahan Neraca di BPS",
            "bullets": [
                "<b>Data Tercecer & Desentralisasi:</b> Berkas penyusunan neraca lingkungan di BPS sebelumnya tersebar di puluhan berkas Excel lokal antar-seksi, menyulitkan kontrol versi mutakhir.",
                "<b>Rekapitulasi Manual Lambat:</b> Kompilasi data survei penunjang (kebakaran, reboisasi, produksi kayu) membutuhkan penyalinan bertahap yang memakan waktu berminggu-minggu.",
                "<b>Formula Rapuh & Inkonsistensi:</b> Rumus Excel lintas-file kerap error (#REF!, #VALUE!) dan tidak adanya validasi otomatis memicu selisih angka saat publikasi statistik."
            ],
            "notes": "Mengapa sistem ini dibutuhkan di BPS? Dalam penyusunan neraca lingkungan, tim statistik menghadapi tiga masalah utama: data survei tercecer tanpa satu basis data terpusat, rekapitulasi tahunan memakan waktu sangat panjang karena mencocokkan puluhan file Excel yang saling tertaut, dan kerentanan rumus Excel yang sering error saat file dipindahkan sehingga berpotensi menimbulkan inkonsistensi data publikasi."
        },
        {
            "num": "SLIDE 3",
            "title": "Solusi: Pengenalan SISNERLING di Lingkungan BPS",
            "bullets": [
                "<b>Apa itu SISNERLING:</b> Purwarupa (Prototype) aplikasi web yang dirancang untuk menginput, memvalidasi, merekapitulasi, dan mengkalkulasi neraca lingkungan secara berkala.",
                "<b>User-Friendly:</b> Mempertahankan antarmuka spreadsheet interaktif yang akrab bagi statistisi, didukung basis data terpusat yang aman.",
                "<b>Kalkulasi Dinamis:</b> Menyediakan mesin formula dinamis yang menghitung perubahan saldo fisik dan moneter secara otomatis.",
                "<b>Multi-Sektor:</b> Siap menampung Neraca Hutan, Neraca Mineral, Energi, dan Neraca Terintegrasi (System of Environmental-Economic Accounting / SEEA)."
            ],
            "notes": "SISNERLING hadir sebagai jawaban atas permasalahan tersebut. Sistem ini membawa seluruh proses penyusunan neraca lingkungan ke web. Tujuannya adalah menciptakan satu sumber kebenaran data (Single Source of Truth) di BPS, memastikan metodologi SEEA berjalan otomatis, dan membebaskan statistisi dari pekerjaan manual yang repetitif."
        },
        {
            "num": "SLIDE 4",
            "title": "Fitur-Fitur Utama Sistem Aplikasi Web SISNERLING",
            "bullets": [
                "<b>1. Manajemen Hak Akses Multi-Role:</b> Pemisahan wewenang: User (Auditor mode hanya-lihat), Admin/Operator (entri data penugasan tabel), dan Super Admin (kontrol akun & konfigurasi penuh).",
                "<b>2. Form Input & Pengolahan Neraca Dinamis:</b> Halaman khusus input neraca deret waktu (Jati Jawa, Rimba Jawa, Luar Jawa, Indonesia) dengan auto-calculation instan fisik & moneter.",
                "<b>3. Statistical Spreadsheet & Excel Import:</b> Editor spreadsheet browser dengan formula evaluator lengkap, import berkas .xlsx instan, dan proteksi penguncian sel (cell-level lock).",
                "<b>4. Dashboard Analytics & Export Laporan:</b> Grafik tren deret waktu tahunan, pemantauan saldo neraca lingkungan, serta fitur export laporan instan ke Excel & PDF terstandar."
            ],
            "notes": "SISNERLING dilengkapi dengan fitur unggulan yang dirancang spesifik untuk operasional statistik: Manajemen Role berjenjang (User, Admin Penugasan, Super Admin), Form Input Pengolahan Neraca dengan kalkulasi otomatis antar-sheet deret waktu, Statistical Spreadsheet lengkap dengan kemampuan import Excel langsung, serta Dashboard Analytics dan Export Laporan terstandar siap pakai."
        },
        {
            "num": "SLIDE 5",
            "title": "Alur Kerja Sistem (Workflow Operasional di BPS)",
            "bullets": [
                "<b>Tahap 1 (Login & Otorisasi):</b> Statistisi login dengan autentikasi aman, mengakses sheet sesuai penugasan tabel dari Super Admin.",
                "<b>Tahap 2 (Input Data Tahunan):</b> Menginput data fisik (pertumbuhan, penanaman, penebangan) dan parameter ekonomi pada form spreadsheet interaktif.",
                "<b>Tahap 3 (Kalkulasi Dinamis):</b> Engine otomatis menghitung perubahan neto, saldo akhir fisik, unit rent, dan valuasi moneter hingga agregasi nasional.",
                "<b>Tahap 4 (Validasi Berjenjang):</b> Penanggung jawab/Validator memeriksa kewajaran angka statistik, status sel, dan konsistensi lintas seksi.",
                "<b>Tahap 5 (Diseminasi & Publikasi):</b> Data neraca yang telah tervalidasi dapat dipantau pada Dashboard Analytics dan diekspor ke draf laporan publikasi BPS."
            ],
            "notes": "Alur kerja pengolahan di SISNERLING sangat runtut dan terkontrol: mulai dari login berbasis penugasan pengguna, pengisian data fisik dan ekonomi, eksekusi kalkulasi dinamis secara otomatis, proses penelaahan dan validasi oleh penanggung jawab, hingga data dikunci dan siap dipublikasikan ke publik dan pemangku kebijakan."
        },
        {
            "num": "SLIDE 6",
            "title": "Arsitektur Sistem & Tumpukan Teknologi (Tech Stack)",
            "bullets": [
                "<b>Frontend:</b> React + Vite + Vanilla CSS Modern (Single Page Application, rendering grid berkecepatan tinggi, tanpa bloatware).",
                "<b>Backend:</b> Node.js + Express.js (REST API modular, neracaFormula dinamis engine, dan streaming parser import Excel).",
                "<b>Basis Data & Real-time:</b> MySQL (InnoDB) untuk integritas transaksional angka neraca dan WebSocket untuk kolaborasi serta cell locking otomatis."
            ],
            "notes": "SISNERLING dibangun dengan standar arsitektur perangkat lunak modern: Frontend menggunakan React dan Vite untuk antarmuka yang sangat responsif saat memuat ribuan sel. Backend Node.js mengeksekusi logika kalkulasi neraca secara cepat. Dan basis data MySQL dengan skema long-format menjamin konsistensi dan skalabilitas penyimpanan data tahunan BPS."
        },
        {
            "num": "SLIDE 7",
            "title": "Kalkulasi Dinamis & Inovasi Dual-Layer Data",
            "bullets": [
                "<b>Kalkulasi Dinamis (DAG Engine):</b> Evaluasi rumus otomatis berantai (persediaan awal tahun berjalan ditarik dari saldo akhir tahun sebelumnya, perubahan fisik langsung mengalir ke moneter).",
                "<b>Pemisahan Lapis Logis vs Lapis Visual:</b> Lapis Logis menyimpan nilai_variabel(variabel, tahun) secara dinamis, sementara Lapis Visual mempertahankan tampilan grid spreadsheet Excel yang akrab bagi statistisi.",
                "<b>Konsolidasi Otomatis:</b> Agregasi data antar wilayah (Jati Jawa, Rimba Jawa, Luar Jawa) ke sheet nasional Indonesia berlangsung seketika tanpa rumus sel manual."
            ],
            "notes": "Inovasi kunci pada sistem ini adalah Kalkulasi Dinamis berbasis DAG dan arsitektur Dual-Layer: sistem memisahkan antara logika data di database dengan representasi visual di layar. Saat operator mengubah satu angka di tahun 2020, sistem secara dinamis mengalirkan perubahannya ke tahun-tahun berikutnya dan ke neraca moneter secara instan tanpa perlu menjalankan macro manual."
        },
        {
            "num": "SLIDE 8",
            "title": "Implementasi: Neraca Hutan & Neraca Kayu (Timber)",
            "bullets": [
                "<b>Neraca Fisik:</b> Volume kayu (m³) dan tutupan lahan (Ha) mencatat saldo awal, pertumbuhan alami, reboisasi, penebangan, kebakaran hutan, hingga saldo akhir.",
                "<b>Unit Rent & Valuasi Moneter:</b> Perhitungan sewa ekonomi sumber daya (resource rent) per m³, biaya eksploitasi, valuasi moneter rupiah, dan revaluasi aset hutan.",
                "<b>Segmentasi Komprehensif:</b> Penataan terpadu sheet Jati Jawa, Rimba Jawa, Rimba Luar Jawa, dan sheet konsolidasi nasional Indonesia.",
                "<b>Standardisasi ~1.992 Variabel:</b> Pemetaan 48% input manual, 51% kalkulasi otomatis dinamis, dan 1% acuan eksternal (KLHK/Perhutani/Harga Pasar)."
            ],
            "notes": "Implementasi riil dari rancang bangun ini telah diterapkan pada modul Neraca Hutan dan Neraca Kayu (Timber) BPS. Sistem berhasil mendigitalkan 1.992 variabel dari puluhan sheet Excel lama ke dalam sistem web: memisahkan persediaan fisik m³, sewa ekonomi, hingga neraca moneter nasional secara otomatis."
        },
        {
            "num": "SLIDE 9",
            "title": "Nilai Manfaat & Dampak Strategis bagi BPS",
            "bullets": [
                "<b>Akurasi Sesuai Standar SEEA:</b> Mengeliminasi risiko kesalahan manusia dan formula Excel; seluruh perhitungan mengacu pada baku mutu akuntansi lingkungan internasional.",
                "<b>Efisiensi Waktu Pengolahan 85%+:</b> Memangkas waktu siklus rekapitulasi data dari berminggu-minggu menjadi instan dalam hitungan detik.",
                "<b>Tata Kelola & Audit Trail:</b> Rekam jejak lengkap atas setiap penambahan dan perubahan angka statistik (siapa, kapan, dan nilai riwayat).",
                "<b>Single Source of Truth Nasional:</b> Menyediakan satu-satunya basis data neraca lingkungan terpusat untuk kebutuhan BPS yang siap diintegrasikan untuk kebijakan lintas kementerian."
            ],
            "notes": "Manfaat yang dirasakan instansi BPS sangat nyata: akurasi data terjamin sesuai standar SEEA, efisiensi waktu pengolahan melonjak signifikan karena eliminasi proses manual, memiliki audit trail lengkap untuk menjamin integritas statistik, dan menjadi Single Source of Truth yang memudahkan penyediaan data bagi kementerian dan lembaga pengguna."
        },
        {
            "num": "SLIDE 10",
            "title": "Kesimpulan & Rencana Pengembangan Masa Depan (Roadmap)",
            "bullets": [
                "<b>Kesimpulan:</b> SISNERLING sukses mentransformasikan penyusunan neraca lingkungan di BPS menjadi sistem berbasis web yang modern, cepat, dan akuntabel.",
                "<b>Interoperabilitas API BPS & K/L:</b> Rencana integrasi data langsung dengan Kementerian Lingkungan Hidup dan Kehutanan (KLHK) dan Kementerian ESDM.",
                "<b>Perluasan Domain Neraca:</b> Pengembangan modul Neraca Mineral, Neraca Energi, Neraca Air, serta Neraca Emisi Gas Rumah Kaca (GRK).",
                "<b>Deteksi Anomali Statistik Cerdas:</b> Peringatan dini otomatis terhadap lonjakan deplesi sumber daya alam atau ketidakwajaran angka input."
            ],
            "notes": "Sebagai penutup, SISNERLING adalah inovasi strategis yang memodernisasi cara BPS mengolah statistik neraca lingkungan hidup. Roadmap ke depan akan menghubungkan sistem ini langsung dengan API kementerian sektoral, memperluas cakupan ke neraca mineral, energi, dan air, serta menghadirkan analitik pintar untuk mendukung perumusan kebijakan pembangunan berkelanjutan. Terima kasih atas perhatian bapak/ibu sekalian, saya membuka sesi diskusi dan tanya jawab."
        }
    ]

    for item in slides:
        story.append(Paragraph(item["num"], slide_badge))
        story.append(Paragraph(item["title"], slide_title))
        for b in item["bullets"]:
            story.append(Paragraph(f"• {b}", bullet_style))
        
        notes_table = Table([[
            Paragraph(f"<b>Catatan Presenter (Speaker Notes):</b><br/>{item['notes']}", notes_box)
        ]], colWidths=[487])
        notes_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f1f5f9')),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#cbd5e1')),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ]))
        story.append(Spacer(1, 2))
        story.append(notes_table)
        story.append(Spacer(1, 6))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Master PDF successfully built: {filename}")

if __name__ == "__main__":
    out_pdf = r"c:\laragon\www\sisnerling\Sisnerling\_dokumen\Presentasi_SISNERLING.pdf"
    build_pdf(out_pdf)
