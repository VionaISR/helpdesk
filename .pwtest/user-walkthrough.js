const { chromium } = require('playwright');
const path = require('path');

const out = p => path.join(__dirname, p);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
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
  await page.fill('input[type="email"]', 'andi.pratama@lippo.id');
  await page.fill('input[type="password"]', 'IT@Andi2026');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  console.log('URL:', page.url());
  await page.screenshot({ path: out('50-user-home.png'), fullPage: true });
  logSection('User home');

  // Submit ticket modal
  await page.click('button:has-text("Submit Tiket"), button:has-text("Buat Tiket"), button:has-text("+ Tiket")').catch(async () => {
    // fallback: dump all buttons
    const btns = await page.locator('button').allInnerTexts();
    console.log('BUTTONS:', JSON.stringify(btns.filter(Boolean)));
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: out('51-user-submit-modal.png'), fullPage: true });
  logSection('Submit modal');

  await browser.close();
})();
