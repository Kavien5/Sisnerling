import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, KeepTogether
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
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#64748b"))
        
        # Header (mulai hal 2)
        if self._pageNumber > 1:
            self.drawString(54, 802, "BEDAH LENGKAP POIN PRESENTASI & PANDUAN BICARA — SISNERLING (BPS)")
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(54, 794, 541, 794)

        # Footer
        footer_text = f"Halaman {self._pageNumber} dari {page_count}"
        self.drawRightString(541, 30, footer_text)
        self.drawString(54, 30, "Panduan Cepat Presentasi Siap Pakai — SISNERLING")
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(54, 42, 541, 42)

        self.restoreState()

def build_cheatsheet_pdf(filename):
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=45,
        rightMargin=45,
        topMargin=48,
        bottomMargin=48
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=17,
        leading=21,
        textColor=colors.HexColor('#0f172a'),
        spaceAfter=3
    )

    subtitle_style = ParagraphStyle(
        'DocSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor('#059669'),
        spaceAfter=10
    )

    slide_badge = ParagraphStyle(
        'SlideBadge',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#2563eb'),
        spaceBefore=12,
        spaceAfter=2,
        keepWithNext=True
    )

    slide_title = ParagraphStyle(
        'SlideTitle',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12.5,
        leading=16.5,
        textColor=colors.HexColor('#0f172a'),
        spaceBefore=0,
        spaceAfter=6,
        keepWithNext=True
    )

    sec_label = ParagraphStyle(
        'SecLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor('#1e293b'),
        spaceBefore=4,
        spaceAfter=2,
        keepWithNext=True
    )

    point_title = ParagraphStyle(
        'PointTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor('#0369a1')
    )

    point_desc = ParagraphStyle(
        'PointDesc',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11.5,
        textColor=colors.HexColor('#334155')
    )

    speech_box = ParagraphStyle(
        'Speech',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8,
        leading=11.5,
        textColor=colors.HexColor('#0f172a')
    )

    story = []

    story.append(Paragraph("BEDAH LENGKAP SETIAP POIN SLIDE PRESENTASI & PANDUAN BICARA", title_style))
    story.append(Paragraph("Panduan Langsung untuk Presenter: Apa Maksud Setiap Poin di PPT & Bagaimana Cara Menjelaskannya", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#059669"), spaceBefore=0, spaceAfter=8))

    slides_content = [
        {
            "badge": "SLIDE 1 (COVER)",
            "title": "Rancang Bangun Sistem Informasi Pengolahan Data dan Kalkulasi Dinamis Neraca Lingkungan (SISNERLING) Berbasis Web pada Instansi Badan Pusat Statistik",
            "points": [
                ("Badan Pusat Statistik (BPS)", 
                 "Artinya: Proyek ini mengambil studi kasus nyata pada kebutuhan BPS dalam menyusun neraca sumber daya alam nasional."),
                ("Pengolahan Data & Kalkulasi Dinamis", 
                 "Artinya: Sistem bukan sekadar tempat mencatat form biasa, tetapi memiliki 'otak' (engine) yang menghitung formula otomatis saat angka diubah."),
                ("Berbasis Web & Purwarupa (Prototype)", 
                 "Artinya: Menggantikan aplikasi desktop Excel offline menjadi portal web yang dapat diakses melalui browser oleh banyak staf.")
            ],
            "speech": "\"Selamat pagi/siang bapak/ibu dewan penguji. Hari ini saya mempresentasikan karya rancang bangun SISNERLING berbasis web pada instansi BPS. Sistem ini adalah solusi modern yang mengintegrasikan penginputan data dengan mesin kalkulasi otomatis agar penyusunan neraca lingkungan lebih cepat, akurat, dan terhindar dari kendala spreadsheet manual.\""
        },
        {
            "badge": "SLIDE 2",
            "title": "Latar Belakang & Masalah Pengolahan Neraca di BPS",
            "points": [
                ("Poin 1: Data Tercecer & Desentralisasi", 
                 "Penjelasan Anda: 'Data survei dan laporan neraca selama ini tersebar di puluhan laptop atau komputer staf masing-masing dalam bentuk file Excel terpisah. Akibatnya, saat ada pegawai yang mutasi atau cuti, data sulit dilacak dan rawan hilang.'"),
                ("Poin 2: Rekapitulasi Manual Lambat", 
                 "Penjelasan Anda: 'Karena file terpisah-pisah, untuk menggabungkan angka satu tahun saja staf harus menyalin angka satu per satu secara manual. Proses ini memakan waktu berminggu-minggu hingga berbulan-bulan hanya untuk menyusun draf tabel.'"),
                ("Poin 3: Formula Rapuh & Inkonsistensi", 
                 "Penjelasan Anda: 'Di Excel, rumus yang menghubungkan sheet satu ke sheet lain sangat rapuh. Jika baris digeser atau nama file diubah, rumusnya langsung rusak (#REF! atau #VALUE!). Ini memicu salah hitung yang baru ketahuan saat laporan dicetak.'")
            ],
            "speech": "\"Bapak/Ibu, ada tiga masalah besar mengapa sistem ini kami buat: Pertama, data tercecer di komputer masing-masing tanpa pusat data. Kedua, rekapitulasi data tahunan sangat lambat karena harus copy-paste antar puluhan file. Ketiga, rumus Excel sering rusak dan menimbulkan ketidaksesuaian angka statistik.\""
        },
        {
            "badge": "SLIDE 3",
            "title": "Solusi: Pengenalan SISNERLING di Lingkungan BPS",
            "points": [
                ("Poin 1: Purwarupa Aplikasi Web Ramah Pengguna", 
                 "Penjelasan Anda: 'SISNERLING menghadirkan tampilan tabel spreadsheet di browser. Statistisi tidak perlu belajar software yang asing karena bentuk tabelnya persis seperti lembar kerja yang biasa mereka gunakan.'"),
                ("Poin 2: Single Source of Truth", 
                 "Penjelasan Anda: 'Artinya satu sumber kebenaran data tunggal. Tidak ada lagi perdebatan versi file (seperti: revisi1, revisi2, final_fix), karena semua orang mengakses data yang sama di database terpusat.'"),
                ("Poin 3: Standar Metodologi SEEA", 
                 "Penjelasan Anda: 'Sistem mengacu pada System of Environmental-Economic Accounting, yaitu standar resmi PBB yang dipakai BPS untuk mengukur saldo fisik dan valuasi moneter lingkungan.'")
            ],
            "speech": "\"Untuk mengatasi masalah tadi, kami membangun SISNERLING. Sistem ini menyatukan seluruh proses ke dalam satu portal web terpusat sebagai Single Source of Truth, sehingga data selalu sinkron, menggunakan standar SEEA, dan tetap mudah digunakan seperti memakai spreadsheet.\""
        },
        {
            "badge": "SLIDE 4",
            "title": "Fitur-Fitur Utama Sistem Aplikasi Web SISNERLING",
            "points": [
                ("Poin 1: Manajemen Hak Akses Multi-Role", 
                 "Penjelasan Anda: 'Membagi peran: User hanya bisa membaca/melihat, Admin hanya bisa menginput pada tabel yang ditugaskan oleh pimpinan, dan Super Admin mengontrol akun dan sistem secara penuh.'"),
                ("Poin 2: Form Input & Pengolahan Neraca Dinamis", 
                 "Penjelasan Anda: 'Halaman khusus deret waktu (tahun 2015-2024). Begitu kita ketik angka tebangan atau penanaman, sistem langsung menghitung saldo akhir detik itu juga.'"),
                ("Poin 3: Statistical Spreadsheet & Excel Import", 
                 "Penjelasan Anda: 'File Excel (.xlsx) lama dari BPS bisa langsung di-upload ke sistem tanpa merusak tampilan sel dan rumusnya.'"),
                ("Poin 4: Dashboard Analytics & Export Laporan", 
                 "Penjelasan Anda: 'Menampilkan grafik pergerakan stok lingkungan dan menyediakan tombol untuk langsung mengunduh draf laporan siap cetak (Excel/PDF).'")
            ],
            "speech": "\"SISNERLING memiliki 4 fitur unggulan: Hak akses bertingkat agar data aman, form input dengan kalkulasi otomatis instan, kemampuan import Excel langsung ke web, serta dashboard grafik dan tombol export laporan cepat.\""
        },
        {
            "badge": "SLIDE 5",
            "title": "Alur Kerja Sistem (Workflow Operasional di BPS)",
            "points": [
                ("Tahap 1: Login & Otorisasi", 
                 "Penjelasan Anda: 'Operator masuk dengan akunnya, sistem langsung membatasi tabel mana saja yang boleh ia isi sesuai SK penugasan.'"),
                ("Tahap 2: Input Data Tahunan", 
                 "Penjelasan Anda: 'Operator menginput angka fisik seperti luas reboisasi atau volume tebangan. Form memiliki validasi agar tidak ada salah ketik huruf/angka.'"),
                ("Tahap 3: Kalkulasi Dinamis", 
                 "Penjelasan Anda: 'Tanpa perlu klik simpan atau hitung manual, engine sistem langsung menjalankan rumus fisik dan moneternya.'"),
                ("Tahap 4: Validasi Berjenjang", 
                 "Penjelasan Anda: 'Data dicek oleh pemeriksa/validator. Jika ada angka janggal bisa ditolak untuk diperbaiki; jika benar, data disahkan.'"),
                ("Tahap 5: Publikasi & Terkunci (Lock)", 
                 "Penjelasan Anda: 'Data yang disahkan akan otomatis dikunci agar tidak bisa diubah sembarangan lagi, lalu langsung muncul di grafik dashboard.'")
            ],
            "speech": "\"Alur kerja sistem berjalan dalam 5 langkah runtut: Dari login sesuai hak akses, input data tervalidasi, kalkulasi otomatis oleh mesin, penelaahan oleh validator, hingga data dikunci dan siap tayang di dashboard tanpa ada proses yang tumpang tindih.\""
        },
        {
            "badge": "SLIDE 6",
            "title": "Arsitektur Sistem & Tumpukan Teknologi (Tech Stack)",
            "points": [
                ("Frontend: React + Vite + Vanilla CSS", 
                 "Penjelasan Anda: 'Aplikasi web Single Page Application yang sangat cepat. Kami memakai Vanilla CSS agar rendering tabel ribuan sel tidak lambat dan bebas bloatware.'"),
                ("Backend: Node.js + Express + neracaFormula.js", 
                 "Penjelasan Anda: 'Server yang mengelola pertukaran data API dan menjalankan rumus matematika neraca di latar belakang.'"),
                ("Database & Realtime: MySQL + WebSocket", 
                 "Penjelasan Anda: 'MySQL menjamin data tersimpan aman transaksional, sedangkan WebSocket memungkinkan kolaborasi kursor dan penguncian sel (cell-lock) jika diedit bersamaan.'")
            ],
            "speech": "\"Di balik layar, sistem dibangun menggunakan teknologi modern: React dan Vite untuk antarmuka yang cepat memuat ribuan data, Node.js untuk pemrosesan rumus, MySQL untuk keamanan basis data, serta WebSocket untuk penguncian sel saat kolaborasi.\""
        },
        {
            "badge": "SLIDE 7",
            "title": "Kalkulasi Dinamis & Inovasi Dual-Layer Data",
            "points": [
                ("DAG (Directed Acyclic Graph) Engine", 
                 "Penjelasan Anda: 'Mesin penghubung rumus berantai. Contohnya: Saldo awal tahun 2022 otomatis mengambil saldo akhir 2021. Jika angka 2021 diubah, maka 2022, 2023, dan 2024 langsung otomatis ter-update serentak tanpa error sirkular.'"),
                ("Konsolidasi Otomatis Nasional", 
                 "Penjelasan Anda: 'Data dari wilayah Jati Jawa, Rimba Jawa, dan Luar Jawa secara otomatis dijumlahkan dan digabungkan ke sheet Indonesia secara dinamis.'"),
                ("Pemisahan Lapis Logis vs Lapis Visual", 
                 "Penjelasan Anda: 'Database menyimpan data secara rapi dan fleksibel (lapis logis), sedangkan di layar pengguna tetap melihat tabel kotak-kotak Excel yang ramah (lapis visual).'")
            ],
            "speech": "\"Inovasi terpenting sistem ini adalah Kalkulasi Dinamis berbasis DAG: perubahan data di satu tahun langsung mengalir otomatis ke tahun-tahun berikutnya dan otomatis teragregasi dari level daerah ke level nasional Indonesia tanpa perlu bantuan macro manual.\""
        },
        {
            "badge": "SLIDE 8",
            "title": "Implementasi: Neraca Hutan & Neraca Kayu (Timber)",
            "points": [
                ("Katalogisasi ~1.992 Variabel", 
                 "Penjelasan Anda: 'Kami berhasil mengidentifikasi dan merapikan 1.992 variabel dari puluhan sheet Excel lama BPS yang sebelumnya ruwet.'"),
                ("51% Formulasi Otomatis", 
                 "Penjelasan Anda: 'Lebih dari separuh pekerjaan staf (51%) kini diambil alih oleh sistem secara otomatis tanpa perlu diketik manual lagi.'"),
                ("Neraca Fisik & Moneter", 
                 "Penjelasan Anda: 'Sistem mengolah volume kayu (m3), luas hutan (Ha), hingga valuasi ekonomi sewa sumber daya (Unit Rent) dalam nilai rupiah.'")
            ],
            "speech": "\"Sistem ini telah teruji nyata pada dataset Neraca Hutan dan Neraca Kayu BPS. Kami berhasil mengintegrasikan 1.992 variabel di mana 51% di antaranya kini terhitung otomatis, mencakup neraca fisik meter kubik hingga valuasi moneter rupiah secara komprehensif.\""
        },
        {
            "badge": "SLIDE 9",
            "title": "Nilai Manfaat & Dampak Strategis bagi BPS",
            "points": [
                ("Akurasi Sesuai Standar SEEA", 
                 "Penjelasan Anda: 'Meniadakan human error (salah ketik atau rumus terhapus). Semua angka dihitung seragam sesuai pedoman statistik resmi.'"),
                ("Efisiensi Waktu 85%+", 
                 "Penjelasan Anda: 'Kompilasi laporan yang dulu butuh berminggu-minggu kini selesai dalam hitungan detik setelah angka dasar terisi.'"),
                ("Audit Trail (Rekam Jejak)", 
                 "Penjelasan Anda: 'Setiap ada perubahan angka, sistem mencatat: siapa yang mengubah, jam berapa, dan berapa angka sebelumnya. Sangat aman untuk audit.'"),
                ("Single Source of Truth", 
                 "Penjelasan Anda: 'Semua pihak di BPS memegang satu data yang sama, tidak ada lagi kebingungan mana data yang paling update.'")
            ],
            "speech": "\"Dampak nyata yang diberikan sistem ini adalah: akurasi data terjamin standar SEEA, efisiensi waktu kerja meningkat di atas 85%, transparansi histori data lengkap siap audit, dan terciptanya satu sumber data terpusat bagi BPS.\""
        },
        {
            "badge": "SLIDE 10",
            "title": "Kesimpulan & Rencana Pengembangan Masa Depan (Roadmap)",
            "points": [
                ("Kesimpulan Purwarupa", 
                 "Penjelasan Anda: 'Purwarupa SISNERLING terbukti berhasil membuktikan bahwa proses penyusunan neraca lingkungan di BPS bisa diotomatisasi penuh lewat web.'"),
                ("Integrasi API Kementerian (KLHK / ESDM)", 
                 "Penjelasan Anda: 'Rencana ke depan: data kebakaran atau produksi tidak perlu diketik manual lagi, melainkan ditarik langsung via API dari kementerian terkait.'"),
                ("Ekspansi ke Neraca Lain", 
                 "Penjelasan Anda: 'Sistem siap diperluas untuk Neraca Mineral, Neraca Energi, Neraca Air, dan Neraca Emisi Karbon.'")
            ],
            "speech": "\"Sebagai penutup, purwarupa SISNERLING telah membuktikan keberhasilan digitalisasi neraca lingkungan yang akurat dan efisien. Rencana ke depan adalah menghubungkan sistem ini langsung ke API kementerian terkait dan memperluas ke sektor mineral, energi, dan air. Terima kasih, saya buka sesi tanya jawab.\""
        }
    ]

    for s in slides_content:
        el = []
        el.append(Paragraph(s["badge"], slide_badge))
        el.append(Paragraph(s["title"], slide_title))

        # Poin-poin penjelasan
        el.append(Paragraph("<b>Maksud & Penjelasan Setiap Poin di Slide:</b>", sec_label))
        t_data = []
        for p_title, p_desc in s["points"]:
            t_data.append([
                Paragraph(p_title, point_title),
                Paragraph(p_desc, point_desc)
            ])
        t_table = Table(t_data, colWidths=[150, 355])
        t_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
            ('TOPPADDING', (0,0), (-1,-1), 3),
            ('BOTTOMPADDING', (0,0), (-1,-1), 3),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ]))
        el.append(t_table)
        el.append(Spacer(1, 3))

        # Naskah ucapan cepat
        el.append(Paragraph("<b>Yang Langsung Anda Ucapkan (Ringkas & Tegas):</b>", sec_label))
        sp_box = Table([[
            Paragraph(s["speech"].replace("\n\n", "<br/>").replace("\n", "<br/>"), speech_box)
        ]], colWidths=[505])
        sp_box.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#ecfdf5')),
            ('BOX', (0,0), (-1,-1), 0.8, colors.HexColor('#10b981')),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ]))
        el.append(sp_box)
        el.append(Spacer(1, 8))

        story.append(KeepTogether(el))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Cheatsheet PDF successfully built: {filename}")

if __name__ == "__main__":
    out_pdf = r"c:\laragon\www\sisnerling\Sisnerling\_dokumen\Penjelasan_Poin_PPT_SISNERLING.pdf"
    build_cheatsheet_pdf(out_pdf)
