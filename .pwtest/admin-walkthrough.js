const { chromium } = require('playwright');
const path = require('path');

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

  const sections = [
    'Dashboard',
    'Semua Tiket',
    'Routing Rules',
    'Aplikasi',
    'Config',
    'Users',
    'Import',
    'Knowledge Base',
    'Reporting',
    'Laporan Mingguan',
    'Cutoff & Rekap',
  ];

  for (let i = 0; i < sections.length; i++) {
    const name = sections[i];
    const before = allLogs.length;
    try {
      await page.click(`.sw-sidebar a.nav-item:has-text("${name}")`);
      await page.waitForTimeout(1200);
      await page.waitForLoadState('networkidle').catch(() => {});
      const fname = `10-admin-${String(i + 1).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-')}.png`;
      await page.screenshot({ path: out(fname), fullPage: true });
      const newLogs = allLogs.slice(before);
      console.log(`=== ${name} ===`);
      console.log(`screenshot: ${fname}`);
      if (newLogs.length) console.log('LOGS:\n' + newLogs.join('\n'));
    } catch (e) {
      console.log(`=== ${name} === ERROR: ${e.message}`);
    }
  }

  await browser.close();
})();
