const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs = [];
  page.on('console', msg => logs.push(`[console.${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', req => logs.push(`[requestfailed] ${req.url()} - ${req.failure()?.errorText}`));

  const out = p => path.join(__dirname, p);

  // 1. Hub page
  await page.goto('http://localhost:3000/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: out('01-hub.png'), fullPage: true });

  // 2. Login page
  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: out('02-login.png'), fullPage: true });

  // 2a. Invalid login test
  await page.fill('input[type="email"]', 'wrong@lippo.id');
  await page.fill('input[type="password"]', 'wrongpass');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out('02b-login-invalid.png'), fullPage: true });

  // 3. Admin login
  await page.fill('input[type="email"]', 'viona@lippo.id');
  await page.fill('input[type="password"]', 'IT@Vio2026');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.waitForLoadState('networkidle');
  console.log('URL after admin login:', page.url());
  await page.screenshot({ path: out('03-admin-home.png'), fullPage: true });

  // dump nav/buttons text
  const navTexts = await page.locator('nav, [class*="nav"], [class*="sidebar"], [class*="menu"]').allInnerTexts();
  console.log('--- NAV TEXTS ---');
  console.log(JSON.stringify(navTexts, null, 2).slice(0, 3000));

  const buttons = await page.locator('button').allInnerTexts();
  console.log('--- BUTTONS ---');
  console.log(JSON.stringify(buttons.filter(Boolean), null, 2).slice(0, 3000));

  console.log('--- LOGS ---');
  console.log(logs.join('\n'));

  await browser.close();
})();
