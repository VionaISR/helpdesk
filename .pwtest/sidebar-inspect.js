const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'viona@lippo.id');
  await page.fill('input[type="password"]', 'IT@Vio2026');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  await page.waitForLoadState('networkidle');

  // Find the sidebar container and dump its outer HTML structure (truncated)
  const sidebarHtml = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('*')).filter(el =>
      el.className && typeof el.className === 'string' && /sidebar|side-nav/i.test(el.className)
    );
    return candidates.map(el => el.outerHTML.slice(0, 1500));
  });
  console.log(JSON.stringify(sidebarHtml, null, 2));

  await browser.close();
})();
