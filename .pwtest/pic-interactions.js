const { chromium } = require('playwright');
const path = require('path');

const out = p => path.join(__dirname, p);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  context.on('page', p => p.on('dialog', d => { console.log('DIALOG:', d.message()); d.accept(); }));
  const page = await context.newPage();
  page.on('dialog', d => { console.log('DIALOG:', d.message()); d.accept(); });

  const allLogs = [];
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') allLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => allLogs.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', req => {
    if (!req.url().includes('hot-update')) allLogs.push(`[requestfailed] ${req.url()} - ${req.failure()?.errorText}`);
  });

  const logSection = (name) => {
    console.log(`=== ${name} === logs: ${allLogs.length}`);
    if (allLogs.length) { console.log(allLogs.join('\n')); allLogs.length = 0; }
  };

  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'leonagata@lippo.id');
  await page.fill('input[type="password"]', 'IT@Leona2026');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000); // let second master-data fetch settle
  allLogs.length = 0; // clear noise from initial load

  // 1. Add a public comment
  await page.fill('textarea', 'Sedang dicek, akan update progress segera.');
  await page.click('button:has-text("Kirim")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: out('40-pic-comment-added.png'), fullPage: true });
  logSection('Add comment');

  // 2. Internal note checkbox + comment
  await page.check('input[type="checkbox"]');
  await page.fill('textarea', 'Catatan internal: cek dengan tim DB.');
  await page.click('button:has-text("Kirim")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: out('41-pic-internal-note.png'), fullPage: true });
  logSection('Internal note');

  // 3. Click "..." menu (status change options) if present
  await page.click('[class*="menu"], button:has-text("⋮")').catch(()=>{});
  await page.waitForTimeout(500);
  await page.screenshot({ path: out('42-pic-status-menu.png'), fullPage: true });
  logSection('Status menu');
  await page.click('.sw-dropdown-backdrop', { force: true }).catch(()=>{});
  await page.waitForTimeout(300);

  // 4. Click "Selesai" to mark Done
  await page.click('button:has-text("Selesai")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: out('43-pic-marked-done.png'), fullPage: true });
  logSection('Mark Selesai');

  // 5. Sidebar filters: Tugas Saya, Semua Tiket, status filters
  await page.click('text=Tugas Saya');
  await page.waitForTimeout(600);
  await page.screenshot({ path: out('44-pic-tugas-saya.png'), fullPage: true });
  logSection('Tugas Saya filter');

  await page.click('text=Semua Tiket');
  await page.waitForTimeout(600);
  await page.screenshot({ path: out('45-pic-semua-tiket.png'), fullPage: true });
  logSection('Semua Tiket filter');

  // 6. Simulasi Email Masuk modal
  await page.click('button:has-text("Simulasi Email Masuk")');
  await page.waitForTimeout(600);
  await page.screenshot({ path: out('46-pic-email-sim.png'), fullPage: true });
  logSection('Email sim modal');

  await browser.close();
})();
