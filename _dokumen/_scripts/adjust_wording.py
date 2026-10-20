import os

def update_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        c = f.read()

    # Penggantian istilah resmi dan penyesuaian tahap prototype/pengembangan
    c = c.replace('Aplikasi web terpadu resmi BPS untuk menginput', 'Purwarupa (Prototype) aplikasi web yang dirancang untuk menginput')
    c = c.replace('aplikasi web terpadu resmi BPS untuk menginput', 'purwarupa (prototype) aplikasi web yang dirancang untuk menginput')
    c = c.replace('Aplikasi web terpadu resmi BPS', 'Sistem aplikasi web yang dirancang untuk lingkungan BPS')
    c = c.replace('aplikasi web terpadu resmi BPS', 'sistem aplikasi web yang dirancang untuk lingkungan BPS')
    
    c = c.replace('satu rujukan data neraca resmi yang konsisten', 'satu rujukan data neraca terpusat yang konsisten')
    c = c.replace('satu-satunya rujukan data resmi', 'rujukan data terpusat')
    
    c = c.replace('fitur export laporan resmi instan ke format Excel dan PDF siap publikasi', 'fitur export laporan instan ke format Excel dan PDF terstandar')
    c = c.replace('fitur export laporan resmi instan ke Excel & PDF siap publikasi', 'fitur export laporan instan ke Excel & PDF terstandar')
    c = c.replace('Export Laporan resmi siap pakai', 'Export Laporan terstandar siap pakai')
    c = c.replace('Laporan resmi siap pakai', 'Laporan terstandar siap pakai')
    
    c = c.replace('Data neraca terkunci resmi (lock), langsung tayang pada Dashboard Analytics dan diekspor untuk Laporan Publikasi BPS.', 'Data neraca yang telah tervalidasi dapat dipantau pada Dashboard Analytics dan diekspor ke draf laporan publikasi BPS.')
    c = c.replace('Data neraca terkunci resmi (lock), langsung tayang pada Dashboard Analytics dan diekspor untuk Laporan Publikasi BPS', 'Data neraca yang telah tervalidasi dapat dipantau pada Dashboard Analytics dan diekspor ke draf laporan publikasi BPS')
    
    c = c.replace('login berbasis penugasan resmi,', 'login berbasis penugasan pengguna,')
    c = c.replace('penugasan resmi,', 'penugasan sistem,')
    
    c = c.replace('template buku publikasi resmi BPS', 'template format laporan publikasi BPS')
    c = c.replace('format laporan baku resmi', 'format laporan baku terstandar')
    c = c.replace('laporan cetak resmi', 'draf laporan publikasi')
    c = c.replace('laporan resmi', 'laporan terstandar')
    
    c = c.replace('basis data neraca lingkungan resmi BPS', 'basis data neraca lingkungan terpusat untuk kebutuhan BPS')
    c = c.replace('data neraca resmi yang konsisten', 'data neraca terpusat yang konsisten')
    c = c.replace('basis data neraca lingkungan resmi BPS yang siap diintegrasikan', 'basis data neraca lingkungan terpusat yang disiapkan untuk integrasi')
    
    c = c.replace('Dokumen Presentasi Resmi BPS: SISNERLING', 'Dokumen Rancang Bangun & Presentasi Sistem: SISNERLING (BPS)')
    c = c.replace('Dokumen Resmi Analisis & Rangkuman Projek Sisnerling', 'Dokumen Rancang Bangun & Analisis Sistem: SISNERLING (BPS)')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(c)
    print(f"Updated: {filepath}")

if __name__ == "__main__":
    update_file(r"c:\laragon\www\sisnerling\Sisnerling\_dokumen\_scripts\generate_master_deck.py")
    update_file(r"c:\laragon\www\sisnerling\Sisnerling\_dokumen\_scripts\generate_master_pdf.py")
    update_file(r"c:\laragon\www\sisnerling\Sisnerling\_dokumen\Dokumentasi_SISNERLING.md")
