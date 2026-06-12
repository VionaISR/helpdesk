import Link from 'next/link';

export default function HubPage() {
  return (
    <div className="hub">
      <div className="hub-eyebrow">Prototype · v3.0 · Next.js</div>
      <h1 className="hub-title">IT Helpdesk Ticketing System</h1>
      <p className="hub-lede">
        Sistem internal ticketing terintegrasi dengan auto-klasifikasi. Login menggunakan email perusahaan untuk mengakses sistem.
      </p>

      <div className="hub-grid">
        <Link className="hub-card" href="/login">
          <div className="hub-card-num">→</div>
          <div className="hub-card-title">Masuk ke Sistem</div>
          <div className="hub-card-desc">Login dengan email perusahaan. Role akan dideteksi otomatis: karyawan, PIC tim IT, atau admin.</div>
          <div className="hub-card-meta">Login · semua role</div>
        </Link>

        <Link className="hub-card" href="/pic">
          <div className="hub-card-num">01</div>
          <div className="hub-card-title">PIC Dashboard</div>
          <div className="hub-card-desc">Tim IT mengelola inbox tiket dengan auto-klasifikasi, workflow status, SLA tracking, dan comment thread.</div>
          <div className="hub-card-meta">Tim IT · 5 modul</div>
        </Link>

        <Link className="hub-card" href="/admin">
          <div className="hub-card-num">02</div>
          <div className="hub-card-title">Admin Panel</div>
          <div className="hub-card-desc">Dashboard analytics, knowledge base manager, konfigurasi kategori & SLA rules, reporting & export.</div>
          <div className="hub-card-meta">Admin · 6 modul</div>
        </Link>
      </div>

      <div className="hub-footer">
        <div>Internal use · 50 tiket/hari · 4 PIC</div>
        <div className="mono">stack: next.js + typescript + localStorage</div>
      </div>
    </div>
  );
}
