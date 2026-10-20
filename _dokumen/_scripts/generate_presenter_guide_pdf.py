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
        self.setFont("Helvetica", 8.5)
        self.setFillColor(colors.HexColor("#64748b"))
        
        # Header (mulai halaman 2)
        if self._pageNumber > 1:
            self.drawString(54, 800, "PANDUAN PEMAPARAN PRESENTER — SISNERLING (STUDI KASUS BPS)")
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(54, 792, 541, 792)

        # Footer
        footer_text = f"Halaman {self._pageNumber} dari {page_count}"
        self.drawRightString(541, 35, footer_text)
        self.drawString(54, 35, "Buku Panduan Presentasi: Intisari Slide, Narasi Ucapan, & Tips Tanya Jawab")
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(54, 48, 541, 48)

        self.restoreState()

def build_presenter_guide_pdf(filename):
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()

    # Custom styles
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

    slide_num_style = ParagraphStyle(
        'SlideNum',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#2563eb'),
        spaceBefore=14,
        spaceAfter=2,
        keepWithNext=True
    )

    slide_title_style = ParagraphStyle(
        'SlideTitle',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=colors.HexColor('#0f172a'),
        spaceBefore=0,
        spaceAfter=8,
        keepWithNext=True
    )

    sec_header_style = ParagraphStyle(
        'SecHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#1e293b'),
        spaceBefore=4,
        spaceAfter=2,
        keepWithNext=True
    )

    bullet_style = ParagraphStyle(
        'Bullet',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12.5,
        textColor=colors.HexColor('#334155'),
        leftIndent=12,
        firstLineIndent=-8,
        spaceAfter=2
    )

    speech_style = ParagraphStyle(
        'SpeechText',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8.5,
        leading=12.5,
        textColor=colors.HexColor('#0f172a')
    )

    tip_style = ParagraphStyle(
        'TipText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11.5,
        textColor=colors.HexColor('#047857')
    )

    story = []

    # Judul Dokumen
    story.append(Paragraph("BUKU PANDUAN LENGKAP PEMAPARAN PRESENTER", title_style))
    story.append(Paragraph("Rancang Bangun Sistem Informasi Pengolahan Data dan Kalkulasi Dinamis Neraca Lingkungan (SISNERLING) Berbasis Web pada Instansi Badan Pusat Statistik", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#059669"), spaceBefore=0, spaceAfter=8))

    # Pengantar Singkat
    intro_p = Paragraph(
        "<b>Petunjuk untuk Presenter:</b> Dokumen ini disusun sebagai pegangan utama Anda saat melakukan presentasi atau sidang pengujian. "
        "Untuk setiap slide, disediakan 3 komponen penting: (1) <b>Intisari & Hasil di Slide</b> (apa yang sedang dilihat penguji/audiens), "
        "(2) <b>Naskah Narasi Ucapan</b> (kata-kata langsung yang dapat Anda ucapkan secara percaya diri), dan "
        "(3) <b>Tips Penekanan & Antisipasi Pertanyaan</b> agar Anda siap menjawab pertanyaan teknis maupun metodologis.",
        ParagraphStyle('Intro', parent=styles['Normal'], fontName='Helvetica', fontSize=8.5, leading=12.5, textColor=colors.HexColor('#334155'), spaceAfter=10)
    )
    story.append(intro_p)

    slides_data = [
        {
            "num": "SLIDE 1",
            "title": "Judul Utama: Rancang Bangun SISNERLING Berbasis Web pada Instansi BPS",
            "summary": [
                "<b>Inti Slide:</b> Menampilkan judul formal karya, logo/badge BPS, serta positioning sistem sebagai purwarupa (prototype) sistem informasi pengolahan neraca lingkungan berbasis web.",
                "<b>Status Projek:</b> Merupakan sistem rancang bangun / purwarupa hasil riset untuk studi kasus pengolahan data neraca di lingkungan BPS yang siap diuji dan dikembangkan lebih lanjut."
            ],
            "speech": "\"Selamat pagi/siang bapak/ibu dewan penguji dan hadirin sekalian. Pada kesempatan ini saya memaparkan karya rancang bangun: Sistem Informasi Pengolahan Data dan Kalkulasi Dinamis Neraca Lingkungan (SISNERLING) Berbasis Web pada instansi Badan Pusat Statistik.\n\nSistem yang kami kembangkan ini hadir sebagai solusi purwarupa modern untuk mendigitalkan seluruh siklus neraca sumber daya alam—mulai dari input terstandar, validasi bertingkat, hingga kalkulasi dinamis secara otomatis yang menggantikan lembar kerja Excel manual.\"",
            "tips": "Buka dengan nada percaya diri dan tenang. Jelaskan secara tegas bahwa sistem ini dirancang dengan studi kasus nyata di lingkungan BPS untuk membuktikan kelayakan otomatisasi kalkulasi neraca."
        },
        {
            "num": "SLIDE 2",
            "title": "Latar Belakang & Masalah Pengolahan Neraca di BPS",
            "summary": [
                "<b>Inti Slide:</b> Membeberkan 3 kendala utama metode konvensional: (1) Data tercecer di Excel lokal masing-masing staf, (2) Rekapitulasi tahunan lambat berminggu-minggu, dan (3) Formula rapuh error (#REF!) tanpa validasi terpusat.",
                "<b>Urgensi:</b> Menjelaskan risiko ketergantungan personil saat terjadi mutasi tim di BPS dan bahaya inkonsistensi angka publikasi."
            ],
            "speech": "\"Bapak/Ibu sekalian, apa yang melatarbelakangi pembuatan SISNERLING? Selama ini, penyusunan neraca lingkungan di BPS sangat bertumpu pada puluhan file Excel yang terpisah di komputer masing-masing staf.\n\nHal ini menimbulkan tiga permasalahan kritis:\n1. Data tercecer dan tidak memiliki repositori terpusat, sehingga rentan hilang saat pergantian tim kerja.\n2. Proses rekapitulasi sangat lambat karena penggabungan angka survei pendukung dilakukan secara manual dan berulang.\n3. Rumus formula Excel sering kali rusak (menghasilkan error #REF! atau #VALUE!) saat file dipindah atau diubah strukturnya, yang berakibat pada potensi selisih angka saat publikasi statistik.\"",
            "tips": "Tekankan bahwa masalahnya bukan pada staf BPS, melainkan pada kelemahan alat bantu (Excel offline) yang tidak dirancang untuk tata kelola multi-user dan integrasi data skala besar."
        },
        {
            "num": "SLIDE 3",
            "title": "Solusi: Pengenalan SISNERLING di Lingkungan BPS",
            "summary": [
                "<b>Inti Slide:</b> Memperkenalkan SISNERLING sebagai prototype platform web terpusat yang ramah statistisi (spreadsheet-friendly), memiliki mesin kalkulasi dinamis, dan mendukung standar SEEA PBB.",
                "<b>Tujuan Strategis:</b> Digitalisasi penuh siklus data, Single Source of Truth, dan otomatisasi metodologi akuntansi lingkungan."
            ],
            "speech": "\"Untuk menjawab permasalahan tersebut, kami merancang dan membangun SISNERLING. SISNERLING adalah sistem aplikasi berbasis web yang dirancang khusus untuk memfasilitasi kebutuhan pencatatan, validasi, dan kalkulasi dinamis neraca lingkungan.\n\nSistem ini tetap mempertahankan kenyamanan tampilan tabular spreadsheet yang sudah sangat akrab bagi statistisi, namun di baliknya ditenagai oleh basis data terpusat dan mesin kalkulasi otomatis. Tujuannya adalah menciptakan 'Single Source of Truth' di mana seluruh data neraca mengacu pada satu sumber terpercaya yang konsisten.\"",
            "tips": "Gunakan istilah 'Single Source of Truth' dan tekankan bahwa transisi ke web tidak memaksa statistisi belajar rumus rumit baru karena antarmuka tetap berbentuk tabular yang familiar."
        },
        {
            "num": "SLIDE 4",
            "title": "Fitur-Fitur Utama Aplikasi Web SISNERLING",
            "summary": [
                "<b>Inti Slide:</b> Menjabarkan 4 modul unggulan aplikasi: (1) Manajemen Role (User, Admin Penugasan, Super Admin), (2) Form Input Pengolahan Neraca Dinamis, (3) Statistical Spreadsheet & Excel Import, dan (4) Dashboard Analytics & Export Laporan.",
                "<b>Hasil Nyata:</b> Sistem membatasi wewenang input hanya pada tabel penugasan resmi, mencegah kesalahan format data, dan menyediakan ekspor dokumen instan."
            ],
            "speech": "\"Secara fungsional, SISNERLING mengusung empat pilar fitur utama:\nPertama, Manajemen Hak Akses Multi-Role: membagi peran secara tegas antara User (hanya melihat), Admin/Operator (yang hanya bisa mengisi data pada tabel yang ditugaskan), dan Super Admin pengelola sistem.\nKedua, Form Input & Pengolahan Neraca Dinamis: halaman terdedikasi untuk entri deret waktu tahunan yang langsung menghitung saldo fisik dan moneter secara otomatis.\nKetiga, Statistical Spreadsheet & Excel Import: memungkinkan berkas Excel .xlsx diunggah langsung ke web tanpa merusak tata letak rumus.\nKeempat, Dashboard Analytics & Export Laporan: visualisasi grafik tren tahunan dan unduhan draf laporan publikasi siap cetak.\"",
            "tips": "Tunjukkan bahwa sistem ini bukan sekadar form sederhana, melainkan platform komprehensif yang mengatur siapa yang boleh mengedit (RBAC) dan bagaimana data diolah otomatis."
        },
        {
            "num": "SLIDE 5",
            "title": "Alur Kerja Sistem (Workflow Operasional di BPS)",
            "summary": [
                "<b>Inti Slide:</b> Menggambarkan alur kerja 5 tahap runtut: Tahap 1 Login -> Tahap 2 Input Data -> Tahap 3 Kalkulasi Dinamis -> Tahap 4 Validasi Berjenjang -> Tahap 5 Publikasi di Dashboard.",
                "<b>Tata Kelola:</b> Memastikan tidak ada lonjakan proses; data hanya tampil di dashboard setelah diverifikasi dan dikunci (lock)."
            ],
            "speech": "\"Bagaimana alur operasional data di dalam SISNERLING?\nAlurnya sangat terstruktur: Dimulai dari operator atau statistisi yang melakukan login sesuai kredensial penugasannya. Kemudian operator mengisi angka fisik pada form interaktif yang telah dipagari validasi sistem.\nSecara seketika, engine sistem mengeksekusi kalkulasi formula neraca tanpa butuh rumus manual.\nData tersebut kemudian masuk ke meja Validator untuk diteliti kewajaran statistiknya. Jika layak, data disetujui dan dikunci (lock). Begitu terkunci, data secara otomatis dipublikasikan ke Dashboard Analytics untuk dipantau pimpinan dan diunduh sebagai draf laporan.\"",
            "tips": "Gunakan tangan untuk mengisyaratkan tahapan mengalir dari kiri ke kanan. Tegaskan konsep validasi: data tidak bisa langsung lolos ke dashboard sebelum disahkan validator."
        },
        {
            "num": "SLIDE 6",
            "title": "Arsitektur Sistem & Tumpukan Teknologi (Tech Stack)",
            "summary": [
                "<b>Inti Slide:</b> Menjelaskan fondasi teknis: Frontend (React + Vite + Vanilla CSS berperforma tinggi), Backend (Node.js + Express + neracaFormula Engine), Database (MySQL InnoDB ACID), serta WebSocket untuk kolaborasi & cell lock.",
                "<b>Keunggulan Teknis:</b> Arsitektur Single Page Application (SPA) yang sangat cepat merender ribuan sel tanpa lag dan tanpa ketergantungan library CSS yang berat."
            ],
            "speech": "\"Dari sisi rekayasa perangkat lunak, SISNERLING dibangun dengan tumpukan teknologi modern:\nDi sisi antarmuka, kami menggunakan React dengan build tool Vite dan Vanilla CSS modular. Pendekatan ini membuat web sangat ringan dan responsif bahkan ketika merender ribuan baris data tabel statistik.\nDi sisi server, kami menggunakan Node.js dan Express yang menjalankan API modular dan mesin kalkulasi neracaFormula.\nSedangkan untuk penyimpanan, kami memilih MySQL dengan engine InnoDB untuk menjamin integritas data transaksional, dipadukan dengan WebSocket untuk kolaborasi real-time dan mekanisme cell-level locking agar tidak terjadi tabrakan input antar pengguna.\"",
            "tips": "Jika penguji bertanya mengapa memakai Vanilla CSS bukan Tailwind, jawab: 'Untuk memegang kendali penuh atas optimasi rendering grid spreadsheet yang membutuhkan performa tinggi tanpa beban bloatware CSS.'"
        },
        {
            "num": "SLIDE 7",
            "title": "Kalkulasi Dinamis & Inovasi Dual-Layer Data",
            "summary": [
                "<b>Inti Slide:</b> Menjelaskan inovasi kunci sistem: (1) Mesin DAG (Directed Acyclic Graph) untuk perhitungan berantai lintas-tahun dan lintas-wilayah, dan (2) Pemisahan Lapis Logis (Database Normal) vs Lapis Visual (Grid Excel).",
                "<b>Cara Kerja Engine:</b> Mengubah angka tahun 2020 langsung otomatis memperbarui saldo awal 2021-2024 dan neraca moneter secara instan tanpa perlu macro."
            ],
            "speech": "\"Inovasi inti dari sistem ini terletak pada Mesin Kalkulasi Dinamis dan arsitektur Dual-Layer Data:\nKami menggunakan algoritma Directed Acyclic Graph (DAG) di mana keterkaitan antar-variabel dievaluasi secara otomatis. Misalnya, saldo awal tahun 2021 secara otomatis mengambil nilai saldo akhir tahun 2020. Ketika angka penanaman atau penebangan diubah, nilai neto fisik, nilai moneter rupiah, hingga agregasi nasional di sheet Indonesia langsung terkalkulasi seketika.\nSelain itu, sistem memisahkan Lapis Logis (basis data generic long-format yang fleksibel) dengan Lapis Visual (tampilan grid yang ramah pengguna). Hasilnya, database tetap ramping dan rapi, namun statistisi tetap menikmati format tabel yang familiar.\"",
            "tips": "Ini adalah slide paling kuat secara teknis. Jelaskan konsep keterkaitan antar-tahun dan agregasi wilayah dengan bangga karena ini menggantikan macro Excel yang sering crash."
        },
        {
            "num": "SLIDE 8",
            "title": "Implementasi: Neraca Hutan & Neraca Kayu (Timber)",
            "summary": [
                "<b>Inti Slide:</b> Pembuktian hasil uji coba riil pada data Neraca Hutan & Timber: mendigitalkan ~1.992 variabel dari puluhan sheet Excel lama ke web.",
                "<b>Cakupan Data:</b> Neraca Fisik (m³, Ha), Unit Rent & Neraca Moneter (Rp), segmentasi regional (Jati Jawa, Rimba Jawa, Luar Jawa), serta konsolidasi Indonesia."
            ],
            "speech": "\"Sebagai bukti implementasi riil, kami telah menguji coba rancang bangun ini pada modul Neraca Hutan dan Neraca Kayu (Timber) BPS.\nDari dokumen mentah yang sebelumnya terdiri dari puluhan sheet tersembunyi, kami berhasil menata dan mengkatalogkan 1.992 variabel:\nSekitar 48% merupakan variabel input manual dari instansi mitra (KLHK, Perhutani), 51% merupakan hasil formulasi kalkulasi otomatis yang kini sepenuhnya ditangani sistem, dan 1% parameter harga acuan pasar.\nSistem sukses mengolah data fisik volume meter kubik, tutupan hektar, hingga valuasi sewa ekonomi moneter per wilayah secara konsisten dan terintegrasi.\"",
            "tips": "Sebutkan angka '1.992 variabel' dan rasio '51% kalkulasi otomatis' untuk menunjukkan bahwa sistem benar-benar telah diuji pada dataset nyata berskala besar, bukan sekadar dummy."
        },
        {
            "num": "SLIDE 9",
            "title": "Nilai Manfaat & Dampak Strategis bagi BPS",
            "summary": [
                "<b>Inti Slide:</b> 4 dampak positif utama: (1) Akurasi data sesuai standar SEEA internasional, (2) Efisiensi waktu pengolahan melonjak 85%+, (3) Akuntabilitas & Audit Trail transparan, dan (4) Single Source of Truth nasional.",
                "<b>Nilai Bisnis:</b> Membebaskan pegawai statistik dari pekerjaan menyalin angka manual menjadi analis kebijakan yang produktif."
            ],
            "speech": "\"Bapak/Ibu sekalian, apa nilai tambah nyata yang dihadirkan oleh rancang bangun SISNERLING ini bagi BPS?\nAda empat dampak strategis:\nPertama, Akurasi data terjamin sesuai metodologi SEEA PBB, meniadakan selisih hitung akibat formula Excel lokal yang terhapus.\nKedua, Efisiensi waktu pengolahan melonjak lebih dari 85%—proses konsolidasi yang dulunya memakan waktu berminggu-minggu kini tuntas dalam hitungan detik setelah angka dasar dimasukkan.\nKetiga, Transparansi penuh melalui log audit; setiap perubahan tercatat siapa pengubahnya dan kapan dilakukan.\nKeempat, Mewujudkan Single Source of Truth yang memudahkan penyediaan data neraca lingkungan bagi kementerian dan lembaga terkait.\"",
            "tips": "Soroti lonjakan efisiensi waktu 85%+ dan penghapusan human-error sebagai poin pamungkas yang paling disukai pimpinan/auditor."
        },
        {
            "num": "SLIDE 10",
            "title": "Kesimpulan & Rencana Pengembangan Masa Depan (Roadmap)",
            "summary": [
                "<b>Inti Slide:</b> Menyimpulkan keberhasilan purwarupa dan memaparkan arah roadmap masa depan (integrasi API kementerian, ekspansi ke neraca mineral/energi/air, deteksi anomali cerdas, dan portal publik eksekutif).",
                "<b>Status & Kesiapan:</b> Menegaskan kesiapan purwarupa untuk diuji coba ke tahap produksi/hosting resmi lembaga saat disetujui."
            ],
            "speech": "\"Sebagai kesimpulan, rancang bangun purwarupa SISNERLING ini membuktikan bahwa modernisasi pengolahan neraca lingkungan berbasis web sangat layak dan efektif diimplementasikan di BPS. Mesin kalkulasi dinamis dan validasi berjenjang terbukti berhasil mengeliminasi kendala teknis spreadsheet manual.\n\nKe depan, roadmap pengembangan sistem ini mencakup integrasi interoperabilitas API dengan instansi sumber data seperti KLHK dan ESDM, perluasan modul ke Neraca Mineral, Energi, dan Emisi Karbon, serta implementasi deteksi anomali statistik cerdas.\n\nDemikian pemaparan yang dapat saya sampaikan. Terima kasih banyak atas perhatian bapak/ibu sekalian, saya membuka kesempatan untuk sesi diskusi dan tanya jawab.\"",
            "tips": "Tutup dengan senyum, ucapan terima kasih yang tulus, dan intonasi ramah namun tegas. Tunjukkan antusiasme Anda untuk berdiskusi pada sesi tanya jawab."
        }
    ]

    for item in slides_data:
        # Keep together block for each slide
        slide_elements = []
        slide_elements.append(Paragraph(item["num"], slide_num_style))
        slide_elements.append(Paragraph(item["title"], slide_title_style))

        # 1. Intisari Slide
        slide_elements.append(Paragraph("<b>1. Intisari & Pokok Bahasan di Slide:</b>", sec_header_style))
        for s in item["summary"]:
            slide_elements.append(Paragraph(f"• {s}", bullet_style))
        slide_elements.append(Spacer(1, 3))

        # 2. Narasi Ucapan (Speaker Speech)
        slide_elements.append(Paragraph("<b>2. Naskah Narasi Ucapan Presenter (Apa yang Anda Katakan):</b>", sec_header_style))
        speech_box = Table([[
            Paragraph(item["speech"].replace("\n\n", "<br/><br/>").replace("\n", "<br/>"), speech_style)
        ]], colWidths=[487])
        speech_box.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#cbd5e1')),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ]))
        slide_elements.append(speech_box)
        slide_elements.append(Spacer(1, 3))

        # 3. Tips Penekanan
        slide_elements.append(Paragraph("<b>3. Tips Presenter & Penekanan Khusus:</b>", sec_header_style))
        tip_box = Table([[
            Paragraph(f"💡 <b>Kiat Pemaparan:</b> {item['tips']}", tip_style)
        ]], colWidths=[487])
        tip_box.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#ecfdf5')),
            ('BOX', (0,0), (-1,-1), 0.8, colors.HexColor('#6ee7b7')),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ]))
        slide_elements.append(tip_box)
        slide_elements.append(Spacer(1, 10))

        story.append(KeepTogether(slide_elements))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Presenter guide PDF successfully built: {filename}")

if __name__ == "__main__":
    out_pdf = r"c:\laragon\www\sisnerling\Sisnerling\_dokumen\Panduan_Pemaparan_Presenter_SISNERLING.pdf"
    build_presenter_guide_pdf(out_pdf)
