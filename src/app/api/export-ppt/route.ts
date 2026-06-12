import { NextRequest, NextResponse } from 'next/server';
import PptxGenJS from 'pptxgenjs';

interface VolumeDay   { label: string; count: number }
interface PicEntry    { name: string; count: number }
interface AgingTicket { id: string; subject: string; assignedName?: string; status: string; ageDays: number }

interface ExportPayload {
  startDate: string; endDate: string;
  total: number; closed: number; open: number; waiting: number; closureRate: number;
  days: string[];
  volumePerDay: VolumeDay[];
  picRanked: PicEntry[];
  appRanked: [string, number][];
  taskRanked: [string, number][];
  agingTickets: AgingTicket[];
  busiest: { label: string; count: number } | null;
  topApp: [string, number] | null;
  longAgingCount: number;
}

export async function POST(req: NextRequest) {
  const d: ExportPayload = await req.json();
  const {
    startDate, endDate, total, closed, open, waiting, closureRate,
    days, volumePerDay, picRanked, appRanked, taskRanked,
    agingTickets, busiest, topApp, longAgingCount,
  } = d;

  const prs = new PptxGenJS();
  prs.layout = 'LAYOUT_WIDE'; // 13.33 × 7.5 in

  const W = 13.33;
  const NAVY   = '0f172a', INDIGO = '6366f1', GREEN  = '16a34a';
  const BLUE   = '2563eb', PURPLE = '7c3aed', RED    = 'dc2626';
  const GRAY   = '64748b', LIGHT  = 'f1f5f9', BORDER = 'e2e8f0';
  const WHITE  = 'FFFFFF', DARK   = '1e293b', BG     = 'f8fafc';
  const FONT   = 'Calibri';
  const RECT   = prs.ShapeType.rect;

  const addHeader = (sl: PptxGenJS.Slide, title: string) => {
    sl.addShape(RECT, { x: 0, y: 0, w: W, h: 1.1, fill: { color: NAVY } });
    sl.addText('IT Helpdesk · PT Lippo Karawaci Tbk.', { x: 0.5, y: 0.1,  w: 8, h: 0.35, fontSize: 9,  color: '94a3b8', fontFace: FONT });
    sl.addText(title,   { x: 0.5, y: 0.38, w: 10, h: 0.65, fontSize: 22, bold: true, color: WHITE, fontFace: FONT });
    sl.addText(`${startDate} – ${endDate}`, { x: W - 3.5, y: 0.35, w: 3, h: 0.4, fontSize: 11, color: '94a3b8', align: 'right', fontFace: FONT });
  };

  // ── SLIDE 1: COVER ────────────────────────────────────────────────────────────
  {
    const sl = prs.addSlide();
    sl.background = { color: NAVY };
    sl.addShape(RECT, { x: 0.5, y: 2.9, w: 2.5, h: 0.07, fill: { color: INDIGO } });
    sl.addText('IT Helpdesk',        { x: 0.5, y: 1.5, w: 12, h: 0.6,  fontSize: 18, color: '94a3b8', fontFace: FONT });
    sl.addText('Weekly IT Support',  { x: 0.5, y: 2.0, w: 12, h: 1.2,  fontSize: 48, bold: true, color: WHITE, fontFace: FONT });
    sl.addText('Summary',            { x: 0.5, y: 3.1, w: 12, h: 1.2,  fontSize: 48, bold: true, color: WHITE, fontFace: FONT });
    sl.addText('PT Lippo Karawaci Tbk.', { x: 0.5, y: 4.5, w: 12, h: 0.5, fontSize: 15, color: '94a3b8', fontFace: FONT });
    sl.addText(`Periode: ${startDate} – ${endDate}`, { x: 0.5, y: 5.1, w: 12, h: 0.45, fontSize: 14, color: INDIGO, fontFace: FONT });
    sl.addText(`Total: ${total} tiket  ·  Closure Rate: ${closureRate}%`, { x: 0.5, y: 5.65, w: 12, h: 0.4, fontSize: 12, color: '475569', fontFace: FONT });
  }

  // ── SLIDE 2: KPI ──────────────────────────────────────────────────────────────
  {
    const sl = prs.addSlide();
    sl.background = { color: BG };
    addHeader(sl, 'Ringkasan KPI');
    const kpis = [
      { label: 'Total Tiket',  value: `${total}`,        sub: 'Periode dipilih',   color: NAVY   },
      { label: 'Closed',       value: `${closed}`,       sub: 'Done + Closed',     color: GREEN  },
      { label: 'Open',         value: `${open}`,         sub: 'Open + In Progress',color: BLUE   },
      { label: 'Waiting',      value: `${waiting}`,      sub: 'Pending + Revisi',  color: PURPLE },
      { label: 'Closure Rate', value: `${closureRate}%`, sub: closureRate >= 70 ? '✓ Target 70%' : 'Target: 70%', color: INDIGO },
    ];
    const cW = 2.3, cGap = 0.15;
    const cStart = (W - 5 * cW - 4 * cGap) / 2;
    kpis.forEach((k, i) => {
      const x = cStart + i * (cW + cGap);
      sl.addShape(RECT, { x, y: 1.3, w: cW, h: 5.9, fill: { color: WHITE }, line: { color: BORDER, pt: 1 } });
      sl.addShape(RECT, { x, y: 1.3, w: cW, h: 0.12, fill: { color: k.color } });
      sl.addText(k.label, { x: x + 0.15, y: 1.65, w: cW - 0.3, h: 0.45, fontSize: 12, color: GRAY, fontFace: FONT });
      sl.addText(k.value, { x: x + 0.1,  y: 2.2,  w: cW - 0.2, h: 2.9,  fontSize: 54, bold: true, color: k.color, fontFace: FONT, align: 'center', valign: 'middle' });
      sl.addText(k.sub,   { x: x + 0.1,  y: 5.2,  w: cW - 0.2, h: 0.6,  fontSize: 10, color: GRAY, fontFace: FONT, align: 'center' });
    });
  }

  // ── SLIDE 3: VOLUME PER HARI ──────────────────────────────────────────────────
  {
    const sl = prs.addSlide();
    sl.background = { color: BG };
    addHeader(sl, 'Volume Tiket per Hari');
    sl.addText(`Total ${total} tiket dalam ${days.length} hari`, { x: 0.5, y: 1.18, w: 12, h: 0.3, fontSize: 11, color: GRAY, fontFace: FONT });
    if (total > 0 && volumePerDay.length > 0) {
      sl.addChart(prs.ChartType.bar, [{
        name: 'Tiket',
        labels: volumePerDay.map(dv => dv.label),
        values: volumePerDay.map(dv => dv.count),
      }], {
        x: 0.5, y: 1.5, w: 12.3, h: 5.7,
        chartColors: [INDIGO], showLegend: false,
        catAxisLabelColor: GRAY, valAxisLabelColor: GRAY,
        showDataLabels: true, dataLabelColor: DARK, dataLabelFontSize: 12,
        valAxisLineShow: false, plotAreaFill: { color: BG }, barGapWidthPct: 35,
      } as Parameters<typeof sl.addChart>[2]);
    } else {
      sl.addText('Tidak ada tiket dalam periode ini', { x: 0.5, y: 3.5, w: 12, h: 1, fontSize: 18, color: GRAY, fontFace: FONT, align: 'center' });
    }
  }

  // ── SLIDE 4: DISTRIBUSI PIC ───────────────────────────────────────────────────
  {
    const sl = prs.addSlide();
    sl.background = { color: BG };
    addHeader(sl, 'Distribusi Tiket per PIC');
    if (picRanked.length > 0) {
      sl.addChart(prs.ChartType.bar, [{
        name: 'Tiket',
        labels: picRanked.map(p => p.name),
        values: picRanked.map(p => p.count),
      }], {
        x: 0.5, y: 1.2, w: 8.5, h: 6.0,
        barDir: 'bar', chartColors: [INDIGO], showLegend: false,
        catAxisLabelColor: DARK, valAxisLabelColor: GRAY,
        showDataLabels: true, dataLabelColor: WHITE, dataLabelFontSize: 11,
        valAxisLineShow: false, plotAreaFill: { color: BG }, barGapWidthPct: 30,
      } as Parameters<typeof sl.addChart>[2]);

      sl.addShape(RECT, { x: 9.2, y: 1.2, w: 3.6, h: 6.0, fill: { color: WHITE }, line: { color: BORDER, pt: 1 } });
      sl.addText('Distribusi Status', { x: 9.4, y: 1.4, w: 3.2, h: 0.4, fontSize: 13, bold: true, color: DARK, fontFace: FONT });
      ([
        { label: 'Closed', count: closed, color: GREEN  },
        { label: 'Open',   count: open,   color: BLUE   },
        { label: 'Waiting',count: waiting, color: PURPLE },
      ] as const).forEach((s, i) => {
        const pct = total > 0 ? Math.round(s.count / total * 100) : 0;
        const by = 2.1 + i * 1.6;
        sl.addText(s.label, { x: 9.4, y: by, w: 2, h: 0.35, fontSize: 13, bold: true, color: s.color, fontFace: FONT });
        sl.addText(`${s.count} tiket · ${pct}%`, { x: 9.4, y: by + 0.35, w: 3.2, h: 0.3, fontSize: 11, color: GRAY, fontFace: FONT });
        sl.addShape(RECT, { x: 9.4, y: by + 0.75, w: 3.2, h: 0.18, fill: { color: LIGHT } });
        if (pct > 0) sl.addShape(RECT, { x: 9.4, y: by + 0.75, w: Math.max(3.2 * pct / 100, 0.05), h: 0.18, fill: { color: s.color } });
      });
    } else {
      sl.addText('Tidak ada data dalam periode ini', { x: 0.5, y: 3.5, w: 12, h: 1, fontSize: 18, color: GRAY, fontFace: FONT, align: 'center' });
    }
  }

  // ── SLIDE 5: TOP APPS + KATEGORI ─────────────────────────────────────────────
  {
    const sl = prs.addSlide();
    sl.background = { color: BG };
    addHeader(sl, 'Top Aplikasi & Kategori Permintaan');
    const tblBorder = { type: 'solid' as const, color: BORDER, pt: 0.5 };
    const hdr  = (t: string) => ({ text: t, options: { bold: true, fontSize: 11, fill: { color: NAVY }, color: WHITE, fontFace: FONT } });
    const cell = (t: string, even: boolean, extra?: object) => ({ text: t, options: { fontSize: 11, fill: { color: even ? WHITE : 'f8fafc' }, color: DARK, fontFace: FONT, ...extra } });

    sl.addText('Top Aplikasi', { x: 0.5, y: 1.2, w: 5.9, h: 0.4, fontSize: 14, bold: true, color: DARK, fontFace: FONT });
    if (appRanked.length > 0) {
      sl.addTable([
        [hdr('Aplikasi'), hdr('Tiket'), hdr('%')],
        ...appRanked.map(([name, count], i) => [
          cell(name, i % 2 === 0),
          cell(`${count}`, i % 2 === 0, { align: 'center', bold: true, color: INDIGO }),
          cell(`${total > 0 ? Math.round(count / total * 100) : 0}%`, i % 2 === 0, { align: 'center', color: GRAY }),
        ]),
      ], { x: 0.5, y: 1.65, w: 5.9, colW: [3.5, 1.2, 1.2], border: tblBorder });
    }

    sl.addShape(RECT, { x: 6.68, y: 1.2, w: 0.02, h: 6.0, fill: { color: BORDER } });

    sl.addText('Kategori Permintaan', { x: 7.0, y: 1.2, w: 5.8, h: 0.4, fontSize: 14, bold: true, color: DARK, fontFace: FONT });
    if (taskRanked.length > 0) {
      sl.addTable([
        [hdr('Kategori'), hdr('Tiket'), hdr('%')],
        ...taskRanked.slice(0, 12).map(([name, count], i) => [
          cell(name, i % 2 === 0),
          cell(`${count}`, i % 2 === 0, { align: 'center', bold: true, color: PURPLE }),
          cell(`${total > 0 ? Math.round(count / total * 100) : 0}%`, i % 2 === 0, { align: 'center', color: GRAY }),
        ]),
      ], { x: 7.0, y: 1.65, w: 5.8, colW: [3.5, 1.2, 1.1], border: tblBorder });
    }
  }

  // ── SLIDE 6: AGING ────────────────────────────────────────────────────────────
  {
    const sl = prs.addSlide();
    sl.background = { color: BG };
    addHeader(sl, 'Aging Tiket Open / Waiting');
    if (agingTickets.length > 0) {
      const h = (t: string) => ({ text: t, options: { bold: true, fontSize: 10, fill: { color: NAVY }, color: WHITE, fontFace: FONT } });
      sl.addTable([
        [h('ID Tiket'), h('Subject'), h('PIC'), h('Status'), h('Usia')],
        ...agingTickets.slice(0, 15).map((t, i) => {
          const ageColor = t.ageDays >= 4 ? RED : t.ageDays >= 2 ? 'd97706' : GRAY;
          const bg = i % 2 === 0 ? WHITE : 'f8fafc';
          const dc = (text: string, extra?: object) => ({ text, options: { fontSize: 10, fill: { color: bg }, color: DARK, fontFace: FONT, ...extra } });
          return [
            dc(t.id, { color: GRAY }),
            dc(t.subject.length > 45 ? t.subject.slice(0, 44) + '…' : t.subject),
            dc(t.assignedName || '-', { color: GRAY }),
            dc(t.status, { align: 'center', color: GRAY }),
            dc(`${t.ageDays}h`, { align: 'center', bold: true, color: ageColor }),
          ];
        }),
      ], { x: 0.5, y: 1.2, w: 12.3, colW: [1.5, 4.8, 2.5, 2.0, 1.0], border: { type: 'solid', color: BORDER, pt: 0.5 } });

      if (longAgingCount > 0) {
        sl.addShape(RECT, { x: 0.5, y: 7.05, w: 12.3, h: 0.3, fill: { color: 'fef2f2' }, line: { color: 'fecaca', pt: 1 } });
        sl.addText(`⚠  ${longAgingCount} tiket berusia ≥4 hari — perlu eskalasi segera`, { x: 0.7, y: 7.05, w: 12, h: 0.3, fontSize: 11, bold: true, color: RED, fontFace: FONT });
      }
    } else {
      sl.addText('✓  Semua tiket sudah selesai — tidak ada aging tiket.', { x: 0.5, y: 3.5, w: 12.3, h: 1, fontSize: 18, color: GREEN, fontFace: FONT, align: 'center' });
    }
  }

  // ── SLIDE 7: SOROTAN ──────────────────────────────────────────────────────────
  if (total > 0) {
    const sl = prs.addSlide();
    sl.background = { color: BG };
    addHeader(sl, 'Sorotan Periode Ini');
    const highlights: Array<{ label: string; value: string; sub: string; color: string }> = [];
    if (busiest && busiest.count > 0) highlights.push({ label: 'Hari Tersibuk',      value: busiest.label,    sub: `${busiest.count} tiket masuk`,               color: INDIGO });
    if (topApp)                        highlights.push({ label: 'Aplikasi Teratas',   value: topApp[0],        sub: `${topApp[1]} tiket (${Math.round(topApp[1] / total * 100)}%)`, color: INDIGO });
    if (picRanked[0])                  highlights.push({ label: 'PIC Beban Tertinggi',value: picRanked[0].name,sub: `${picRanked[0].count} tiket (${Math.round(picRanked[0].count / total * 100)}%)`, color: GREEN });
    if (longAgingCount > 0)            highlights.push({ label: 'Perlu Eskalasi',     value: `${longAgingCount} tiket ≥4h`, sub: 'Belum selesai, perlu prioritas', color: RED });

    if (highlights.length > 0) {
      const bW = (12.33 - (highlights.length - 1) * 0.3) / highlights.length;
      highlights.forEach((hh, i) => {
        const bx = 0.5 + i * (bW + 0.3);
        sl.addShape(RECT, { x: bx, y: 1.3, w: bW, h: 5.9, fill: { color: WHITE }, line: { color: BORDER, pt: 1 } });
        sl.addShape(RECT, { x: bx, y: 1.3, w: bW, h: 0.15, fill: { color: hh.color } });
        sl.addText(hh.label.toUpperCase(), { x: bx + 0.25, y: 1.65, w: bW - 0.5, h: 0.4,  fontSize: 10, color: GRAY,     bold: true, fontFace: FONT });
        sl.addText(hh.value,               { x: bx + 0.25, y: 2.2,  w: bW - 0.5, h: 2.5,  fontSize: 26, bold: true, color: hh.color, fontFace: FONT, valign: 'top' });
        sl.addText(hh.sub,                 { x: bx + 0.25, y: 5.3,  w: bW - 0.5, h: 0.6,  fontSize: 12, color: GRAY,     fontFace: FONT });
      });
    }
  }

  const pptxBuffer = await prs.write({ outputType: 'nodebuffer' }) as Buffer;
  const body = new Uint8Array(pptxBuffer);

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="IT_Helpdesk_Weekly_${startDate}_${endDate}.pptx"`,
    },
  });
}
