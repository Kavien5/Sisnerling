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
            self.drawString(54, 800, "SISNERLING — Rangkuman Eksekutif & Arsitektur Sistem")
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(54, 792, 541, 792)

        # Footer
        footer_text = f"Halaman {self._pageNumber} dari {page_count}"
        self.drawRightString(541, 35, footer_text)
        self.drawString(54, 35, "Dokumen Resmi Analisis & Rangkuman Projek Sisnerling")
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

    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=26,
        textColor=colors.HexColor('#0f172a'),
        spaceAfter=6
    )

    subtitle_style = ParagraphStyle(
        'DocSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#059669'),
        spaceAfter=14
    )

    h1_style = ParagraphStyle(
        'H1',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=colors.HexColor('#1e293b'),
        spaceBefore=14,
        spaceAfter=8,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'H2',
        parent=styles['Heading3'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor('#2563eb'),
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor('#334155'),
        spaceAfter=6
    )

    bullet_style = ParagraphStyle(
        'Bullet',
        parent=body_style,
        leftIndent=14,
        firstLineIndent=-10,
        spaceAfter=4
    )

    table_text = ParagraphStyle(
        'TableText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.5,
        textColor=colors.HexColor('#1e293b')
    )

    table_header = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.white
    )

    story = []

    # Title & Subtitle
    story.append(Paragraph("RANGKUMAN EKSEKUTIF PROJEK: SISNERLING", title_style))
    story.append(Paragraph("Sistem Pengolahan Data Neraca Lingkungan Hidup & Kehutanan Berbasis Web", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#059669"), spaceBefore=0, spaceAfter=12))

    # 1. LATAR BELAKANG
    story.append(Paragraph("1. Latar Belakang & Urgensi Proyek", h1_style))
    story.append(Paragraph(
        "Sebelum adanya <b>Sisnerling</b>, penyusunan Neraca Sumber Daya Alam (khususnya Neraca Fisik & Moneter Hutan "
        "serta Neraca Kayu/Timber) dilakukan secara manual menggunakan puluhan file lembar kerja Microsoft Excel. "
        "Proses tersebut menghadapi berbagai kendala kritis:",
        body_style
    ))
    story.append(Paragraph("• <b>Formula Lintas-File yang Rapuh:</b> Ratusan formula yang merujuk sel di sheet dan file berbeda kerap kali rusak (menghasilkan error <i>#REF!</i> atau <i>#VALUE!</i>) saat file dipindahkan direktori atau diubah namanya.", bullet_style))
    story.append(Paragraph("• <b>Risiko Human-Error & Penumpukan Versi:</b> Salin-tempel (copy-paste) angka antar sheet memicu selisih hitung serta menghasilkan banyak versi file yang membingungkan (v1, v2_revisi, final).", bullet_style))
    story.append(Paragraph("• <b>Ketiadaan Validasi dan Akses Kontrol:</b> Tidak ada sistem pembagian kewenangan yang jelas antara staf entri data, pemeriksa rumus, dan pimpinan.", bullet_style))

    # 2. TUJUAN & SOLUSI
    story.append(Paragraph("2. Solusi Utama Sisnerling", h1_style))
    story.append(Paragraph(
        "Sisnerling mentransformasikan pengelolaan manual berbasis file Excel menjadi <b>platform web terpusat, modern, dan kolaboratif</b> "
        "dengan menerapkan arsitektur <b>Dual-Layer Engine</b>:",
        body_style
    ))
    story.append(Paragraph("• <b>Lapis Logis (Logical Layer):</b> Memisahkan data secara terstruktur ke dalam basis data generic long-format. Menormalisasi ~1.992 variabel dan menghitung rumus secara otomatis melalui Rule Engine (DAG & Topological Sort).", bullet_style))
    story.append(Paragraph("• <b>Lapis Visual (Spreadsheet Grid):</b> Menyajikan antarmuka tabular grid yang intuitif dan persis seperti Excel agar analis tidak membutuhkan kurva belajar yang rumit.", bullet_style))
    story.append(Paragraph("• <b>Kolaborasi Real-Time:</b> Mendukung penyuntingan bersama dengan indikator kehadiran, sinkronisasi kursor, dan perlindungan penguncian sel (cell-level locking).", bullet_style))

    # 3. FITUR UTAMA
    story.append(Paragraph("3. Fitur Utama Platform", h1_style))
    story.append(Paragraph("A. Modul Neraca Hutan & Timber", h2_style))
    story.append(Paragraph(
        "Mencakup perhitungan Neraca Fisik (volume tegakan m³ dan luas tutupan hektar) serta Neraca Moneter (sewa ekonomi / resource rent). "
        "Data dikelompokkan komprehensif mulai dari Jati Jawa, Rimba Jawa, Rimba Luar Jawa, hingga agregasi nasional Indonesia.",
        body_style
    ))
    story.append(Paragraph("B. Manajemen Hak Akses Berjenjang (RBAC)", h2_style))
    story.append(Paragraph("• <b>User:</b> Hak akses baca (read-only) untuk melihat dashboard, data neraca, dan unduh laporan resmi tanpa risiko mengubah data.", bullet_style))
    story.append(Paragraph("• <b>Admin:</b> Bertugas menginput dan memperbarui data hanya pada tabel/modul yang resmi ditugaskan oleh Super Admin.", bullet_style))
    story.append(Paragraph("• <b>Super Admin:</b> Memiliki kendali menyeluruh mencakup import file Excel, manajemen penugasan tabel, backup/restore database, serta mode pemeliharaan.", bullet_style))

    # 4. TECH STACK TABLE
    story.append(Paragraph("4. Tumpukan Teknologi (Tech Stack)", h1_style))
    table_data = [
        [Paragraph("Komponen", table_header), Paragraph("Teknologi", table_header), Paragraph("Fungsi & Peran Utama", table_header)],
        [Paragraph("Frontend", table_text), Paragraph("React + Vite + Vanilla CSS", table_text), Paragraph("Single Page Application (SPA), interaktif, rendering tabel sangat cepat", table_text)],
        [Paragraph("Backend", table_text), Paragraph("Node.js + Express.js", table_text), Paragraph("RESTful API modular, Rule Engine matematika, pemrosesan file Excel", table_text)],
        [Paragraph("Realtime", table_text), Paragraph("WebSocket (Collab Engine)", table_text), Paragraph("Sinkronisasi kursor, penguncian sel multi-pengguna tanpa tabrakan input", table_text)],
        [Paragraph("Database", table_text), Paragraph("MySQL / MariaDB (InnoDB)", table_text), Paragraph("Penyimpanan transaksional, skema generic long-format, audit logging", table_text)],
    ]
    t = Table(table_data, colWidths=[80, 140, 267])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#f8fafc'), colors.white]),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))

    # 5. NILAI & MANFAAT
    story.append(Paragraph("5. Dampak dan Nilai Manfaat", h1_style))
    story.append(Paragraph("• <b>Efisiensi Waktu Signifikan:</b> Memangkas waktu penyusunan neraca dari berminggu-minggu menjadi hitungan menit setelah data dasar diisi.", bullet_style))
    story.append(Paragraph("• <b>Akurasi & Integritas Data:</b> Rumus terpusat di server memastikan konsistensi metodologi tanpa risiko formula terhapus tidak sengaja.", bullet_style))
    story.append(Paragraph("• <b>Transparansi Penuh (Audit Trail):</b> Seluruh riwayat perubahan nilai sel tercatat secara akurat (siapa pengubahnya dan kapan dilakukan).", bullet_style))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"PDF successfully built: {filename}")

if __name__ == "__main__":
    out_pdf = r"c:\laragon\www\sisnerling\Sisnerling\_dokumen\Rangkuman_Eksekutif_Sisnerling.pdf"
    build_pdf(out_pdf)
