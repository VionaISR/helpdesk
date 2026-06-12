const { chromium } = require('playwright');
const path = require('path');

const out = p => path.join(__dirname, p);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log(`[console.${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.log(`[pageerror] ${err.message}\n${err.stack}`));
  page.on('requestfinished', req => {
    if (req.url().includes('supabase')) {
      console.log(`[supabase req] ${req.method()} ${req.url()}`);
    }
  });
  page.on('response', async res => {
    if (res.url().includes('supabase')) {
      console.log(`[supabase res] ${res.status()} ${res.url()}`);
    }
  });

  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'leonagata@lippo.id');
  await page.fill('input[type="password"]', 'IT@Leona2026');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  await page.waitForLoadState('networkidle');
  console.log('URL:', page.url());

  // wait extra and re-check
  await page.waitForTimeout(5000);
  const bodyHtml = await page.evaluate(() => document.body.innerHTML.length);
  console.log('body innerHTML length:', bodyHtml);
  await page.screenshot({ path: out('31-pic-after-wait.png'), fullPage: true });

  await browser.close();
})();
