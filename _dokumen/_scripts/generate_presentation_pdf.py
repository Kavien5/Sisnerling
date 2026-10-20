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
            self.drawString(54, 800, "SISNERLING — Panduan Presentasi & Speaker Notes")
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(54, 792, 541, 792)

        # Footer
        footer_text = f"Halaman {self._pageNumber} dari {page_count}"
        self.drawRightString(541, 35, footer_text)
        self.drawString(54, 35, "Dokumen Presentasi Resmi SISNERLING")
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
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#0f172a'),
        spaceAfter=4
    )

    subtitle_style = ParagraphStyle(
        'DocSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#059669'),
        spaceAfter=12
    )

    slide_badge = ParagraphStyle(
        'SlideBadge',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor('#2563eb'),
        spaceBefore=12,
        spaceAfter=2,
        keepWithNext=True
    )

    slide_title = ParagraphStyle(
        'SlideTitle',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=colors.HexColor('#0f172a'),
        spaceBefore=0,
        spaceAfter=6,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#334155'),
        spaceAfter=4
    )

    bullet_style = ParagraphStyle(
        'Bullet',
        parent=body_style,
        leftIndent=14,
        firstLineIndent=-10,
        spaceAfter=3
    )

    notes_box = ParagraphStyle(
        'Notes',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor('#1e293b')
    )

    story = []

    # Title
    story.append(Paragraph("DOKUMEN SLIDE PRESENTASI & SPEAKER NOTES", title_style))
    story.append(Paragraph("SISNERLING: Digitalisasi Pengelolaan Data Lingkungan Tahunan", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#059669"), spaceBefore=0, spaceAfter=10))

    slides_content = [
        {
            "num": "SLIDE 1",
            "title": "SISNERLING (Sistem Neraca Lingkungan) — Digitalisasi Pengelolaan Data Lingkungan Tahunan",
            "bullets": [
                "<b>Kategori:</b> Sistem Pengolahan Data Berbasis Web Terintegrasi.",
                "<b>Fokus:</b> Digitalisasi Pengelolaan Data Lingkungan Tahunan untuk Pengambilan Keputusan Strategis.",
                "<b>Tujuan:</b> Menginput, memvalidasi, merekap, dan menganalisis neraca sumber daya alam secara berkala dalam satu pintu."
            ],
            "notes": "Selamat pagi/siang bapak/ibu sekalian. Pada kesempatan ini saya ingin memperkenalkan SISNERLING (Sistem Neraca Lingkungan), sebuah platform aplikasi web yang kami kembangkan untuk mendigitalisasi seluruh siklus pengelolaan data lingkungan tahunan. Sistem ini hadir untuk menjembatani kebutuhan data lingkungan yang akurat, cepat, dan terpercaya sebagai fondasi pengambilan keputusan dan kebijakan strategis."
        },
        {
            "num": "SLIDE 2",
            "title": "Latar Belakang & Kendala Pengelolaan Data Manual",
            "bullets": [
                "<b>Data Tercecer & Desentralisasi:</b> Data lingkungan tersebar di banyak file Excel lokal di komputer masing-masing staf, rawan hilang saat pergantian personil.",
                "<b>Rekapitulasi Lambat & Rumit:</b> Kompilasi angka neraca membutuhkan penggabungan puluhan file secara manual yang memakan waktu berminggu-minggu.",
                "<b>Ketidaksesuaian Data:</b> Rumus formula Excel sering rusak (#REF!, #VALUE!), perbedaan format, dan ketiadaan validasi otomatis memicu inkonsistensi data."
            ],
            "notes": "Sebelum adanya SISNERLING, pengelolaan data neraca lingkungan bertumpu pada spreadsheet Excel manual. Ini menimbulkan 3 kendala besar: data tercecer tanpa repositori terpusat, proses rekapitulasi yang sangat lambat, dan sering timbul ketidaksesuaian data akibat rumus yang rusak atau salah ketik yang baru disadari saat laporan dicetak."
        },
        {
            "num": "SLIDE 3",
            "title": "Solusi & Pengenalan SISNERLING",
            "bullets": [
                "<b>Apa itu SISNERLING:</b> Aplikasi web terpusat untuk mencatat, mengolah, dan mengevaluasi data neraca lingkungan berkala dengan aman.",
                "<b>User-Friendly:</b> Mempertahankan kenyamanan input grid spreadsheet interaktif namun dengan kekuatan database terpusat.",
                "<b>Tujuan Utama:</b> Digitalisasi penuh tanpa kertas/file tercecer, mewujudkan Single Source of Truth, dan mendukung kebijakan berbasis data riil (evidence-based policy)."
            ],
            "notes": "SISNERLING hadir mengintegrasikan seluruh tahapan pengelolaan neraca lingkungan ke dalam sebuah portal web terpusat. Tujuannya adalah memastikan data tersimpan rapi, tidak tercecer, dan pimpinan dapat mengakses angka neraca yang akurat kapan pun untuk mengambil kebijakan strategis."
        },
        {
            "num": "SLIDE 4",
            "title": "Fitur-Fitur Utama Web SISNERLING",
            "bullets": [
                "<b>Manajemen Pengguna Multi-Role:</b> Pemisahan hak akses antara Operator (entri data penugasan), Validator (verifikasi data), dan Admin/Super Admin (pengelola sistem).",
                "<b>Form Input Tahunan Interaktif:</b> Formulir berbasis grid spreadsheet dengan validasi tipe angka otomatis dan deteksi kesalahan instan.",
                "<b>Validasi Berjenjang:</b> Alur persetujuan terstruktur dari status Draf/Pending hingga Verifikasi dan Penguncian (Lock) periode.",
                "<b>Dashboard Analytics & Export Laporan:</b> Grafik tren deret waktu tahunan serta export laporan instan ke Excel & PDF siap cetak."
            ],
            "notes": "Ada 4 pilar fitur utama: 1) Manajemen Multi-Role untuk pembagian wewenang yang tegas, 2) Form Input Interaktif yang mudah dipakai seperti Excel namun tervalidasi, 3) Validasi Berjenjang agar data yang masuk benar-benar layak, dan 4) Dashboard Analytics untuk memantau tren serta export laporan instan."
        },
        {
            "num": "SLIDE 5",
            "title": "Alur Kerja Sistem (Workflow Operasional)",
            "bullets": [
                "<b>Tahap 1 (Login & Hak Akses):</b> Pengguna login sesuai akun dan hak akses masing-masing (Operator, Validator, Admin).",
                "<b>Tahap 2 (Pengisian Data):</b> Operator memasukkan data tahunan pada form spreadsheet sesuai lingkup penugasan.",
                "<b>Tahap 3 (Kalkulasi Otomatis):</b> Sistem menghitung formula neraca fisik & moneter secara otomatis.",
                "<b>Tahap 4 (Proses Validasi):</b> Validator memeriksa kewajaran data (dapat menyetujui atau mengembalikan untuk revisi).",
                "<b>Tahap 5 (Publikasi ke Dashboard):</b> Data tervalidasi otomatis tampil di Dashboard publik dan siap diekspor."
            ],
            "notes": "Alur operasional SISNERLING sangat runtut: dimulai dari Operator menginput data tahunan, sistem otomatis menghitung formula, lalu Validator memeriksa keabsahannya. Begitu disetujui, data langsung terkunci dan dipublikasikan ke Dashboard untuk dianalisis oleh pimpinan tanpa ada tahapan yang terlewat."
        },
        {
            "num": "SLIDE 6",
            "title": "Mengapa Kita Membutuhkan SISNERLING?",
            "bullets": [
                "<b>Akurasi Data Terjamin:</b> Standarisasi validasi input dan rumus terpusat meniadakan risiko human-error serta formula terhapus.",
                "<b>Efisiensi Waktu Signifikan:</b> Memangkas waktu penyusunan neraca dari berminggu-minggu menjadi instan begitu data diverifikasi.",
                "<b>Keamanan & Histori Lengkap:</b> Pencatatan rekam jejak lengkap (Audit Trail) atas setiap penambahan dan perubahan data.",
                "<b>Single Source of Truth:</b> Satu-satunya sumber data resmi yang konsisten bagi seluruh unit, menghilangkan perdebatan versi file."
            ],
            "notes": "Empat alasan mengapa organisasi membutuhkan SISNERLING: Pertama, Akurasi data terjamin oleh sistem. Kedua, Efisiensi waktu yang sangat tinggi. Ketiga, Keamanan dan transparansi dengan histori pengeditan lengkap. Dan keempat, Menjadi Single Source of Truth sehingga tidak ada lagi perbedaan versi laporan."
        },
        {
            "num": "SLIDE 7",
            "title": "Kesimpulan & Rencana Pengembangan (Roadmap)",
            "bullets": [
                "<b>Kesimpulan:</b> SISNERLING sukses mendigitalisasi pengelolaan neraca lingkungan menjadi terpusat, cepat, dan akuntabel.",
                "<b>Integrasi API Eksternal:</b> Roadmap integrasi langsung dengan basis data instansi terkait (BPS / KLHK).",
                "<b>Ekspansi Neraca Sumber Daya:</b> Penambahan modul neraca energi, mineral, sumber daya air, dan emisi karbon.",
                "<b>Deteksi Anomali Cerdas:</b> Sistem peringatan dini otomatis terhadap lonjakan deplesi sumber daya yang tidak wajar."
            ],
            "notes": "Sebagai penutup, SISNERLING adalah fondasi digital yang kuat untuk tata kelola data lingkungan kita. Ke depan, kami berencana menghubungkan sistem ini langsung ke API instansi eksternal seperti BPS atau KLHK, memperluas ke neraca energi dan emisi, serta menghadirkan deteksi anomali dini. Terima kasih, saya buka untuk sesi diskusi."
        }
    ]

    for item in slides_content:
        story.append(Paragraph(item["num"], slide_badge))
        story.append(Paragraph(item["title"], slide_title))
        for b in item["bullets"]:
            story.append(Paragraph(f"• {b}", bullet_style))
        
        # Speaker notes table/box
        notes_table = Table([[
            Paragraph(f"<b>Catatan Presenter (Speaker Notes):</b><br/>{item['notes']}", notes_box)
        ]], colWidths=[487])
        notes_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f1f5f9')),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#cbd5e1')),
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ]))
        story.append(Spacer(1, 3))
        story.append(notes_table)
        story.append(Spacer(1, 8))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Presentation PDF successfully built: {filename}")

if __name__ == "__main__":
    out_pdf = r"c:\laragon\www\sisnerling\Sisnerling\_dokumen\Presentasi_SISNERLING_Lengkap.pdf"
    build_pdf(out_pdf)
