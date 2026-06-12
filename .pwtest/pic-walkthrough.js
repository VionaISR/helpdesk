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
  console.log('URL after PIC login:', page.url());
  await page.screenshot({ path: out('30-pic-home.png'), fullPage: true });
  logSection('PIC home');

  // Dump nav structure
  const navHtml = await page.evaluate(() => {
    const el = document.querySelector('[class*="sidebar"], [class*="nav"]');
    return el ? el.outerHTML.slice(0, 2000) : 'NOT FOUND';
  });
  console.log('NAV HTML:', navHtml);

  await browser.close();
})();
