const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const out = p => path.join(__dirname, p);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const allLogs = [];
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      allLogs.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => allLogs.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', req => {
    if (!req.url().includes('hot-update')) {
      allLogs.push(`[requestfailed] ${req.url()} - ${req.failure()?.errorText}`);
    }
  });

  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'viona@lippo.id');
  await page.fill('input[type="password"]', 'IT@Vio2026');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  await page.waitForLoadState('networkidle');

  const logSection = (name) => {
    console.log(`=== ${name} === logs: ${allLogs.length}`);
    if (allLogs.length) { console.log(allLogs.join('\n')); allLogs.length = 0; }
  };

  const closeModal = async () => {
    await page.click('.modal-header button:has-text("✕")').catch(() => {});
    await page.waitForTimeout(400);
  };

  // 1. Semua Tiket -> click first row
  await page.click('.sw-sidebar a.nav-item:has-text("Semua Tiket")');
  await page.waitForTimeout(800);
  await page.click('table tbody tr:first-child');
  await page.waitForTimeout(800);
  await page.screenshot({ path: out('20-ticket-detail.png'), fullPage: true });
  logSection('Ticket detail modal');
  await closeModal();

  // 2. Routing Rules -> Set PIC modal
  await page.click('.sw-sidebar a.nav-item:has-text("Routing Rules")');
  await page.waitForTimeout(800);
  await page.click('table tbody tr:first-child button:has-text("Set PIC")');
  await page.waitForTimeout(600);
  await page.screenshot({ path: out('21-set-pic-modal.png'), fullPage: true });
  logSection('Set PIC modal');
  await closeModal();

  // 3. Aplikasi -> Tambah Aplikasi modal
  await page.click('.sw-sidebar a.nav-item:has-text("Aplikasi")');
  await page.waitForTimeout(800);
  await page.click('button:has-text("Tambah Aplikasi")');
  await page.waitForTimeout(600);
  await page.screenshot({ path: out('22-tambah-aplikasi.png'), fullPage: true });
  logSection('Tambah Aplikasi modal');
  await closeModal();

  // 4. Knowledge Base -> Artikel Baru modal
  await page.click('.sw-sidebar a.nav-item:has-text("Knowledge Base")');
  await page.waitForTimeout(800);
  await page.click('button:has-text("Artikel Baru")');
  await page.waitForTimeout(600);
  await page.screenshot({ path: out('23-artikel-baru.png'), fullPage: true });
  logSection('Artikel Baru modal');
  await closeModal();

  // 5. Users -> Tambah PIC modal
  await page.click('.sw-sidebar a.nav-item:has-text("Users")');
  await page.waitForTimeout(800);
  await page.click('button:has-text("Tambah PIC")');
  await page.waitForTimeout(600);
  await page.screenshot({ path: out('24-tambah-pic.png'), fullPage: true });
  logSection('Tambah PIC modal');
  await closeModal();

  // 6. Laporan Mingguan -> Export PPT
  await page.click('.sw-sidebar a.nav-item:has-text("Laporan Mingguan")');
  await page.waitForTimeout(800);
  // widen date range to cover seed ticket dates
  const dateInputs = await page.locator('input[type="date"]').all();
  if (dateInputs.length >= 2) {
    await dateInputs[0].fill('2026-05-01');
    await dateInputs[1].fill('2026-06-12');
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: out('25-laporan-widened.png'), fullPage: true });

  let downloadOk = false, downloadError = null;
  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.click('button:has-text("Export PPT")'),
    ]);
    const fpath = out('25-export.pptx');
    await download.saveAs(fpath);
    downloadOk = fs.existsSync(fpath) && fs.statSync(fpath).size > 0;
  } catch (e) {
    downloadError = e.message;
  }
  console.log(`Export PPT download success: ${downloadOk}, error: ${downloadError}`);
  logSection('Export PPT');

  await browser.close();
})();
