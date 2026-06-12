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
  allLogs.length = 0;

  // Open Buat Tiket modal
  await page.click('button:has-text("Buat Tiket Baru")');
  await page.waitForTimeout(600);

  // Fill subject
  await page.fill('input[placeholder*="Ringkasan"]', 'Tidak bisa login ke Prosys');

  // App search
  await page.fill('input[placeholder*="aplikasi"]', 'prosys');
  await page.waitForTimeout(600);
  await page.screenshot({ path: out('60-user-app-search.png'), fullPage: true });
  logSection('App search dropdown');

  // pick first suggestion
  const appOption = page.locator('[class*="suggest"], [class*="dropdown"], [class*="option"]').first();
  if (await appOption.count() > 0) {
    await appOption.click().catch(()=>{});
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: out('61-user-app-selected.png'), fullPage: true });
  logSection('After app select');

  // Specific task search
  await page.fill('input[placeholder*="task"]', 'login').catch(()=>{});
  await page.waitForTimeout(600);
  await page.screenshot({ path: out('62-user-task-search.png'), fullPage: true });
  logSection('Task search dropdown');
  const taskOption = page.locator('[class*="suggest"], [class*="dropdown"], [class*="option"]').first();
  if (await taskOption.count() > 0) {
    await taskOption.click().catch(()=>{});
  }
  await page.waitForTimeout(300);

  // Description
  await page.fill('textarea[placeholder*="Jelaskan"]', 'Sudah coba reset password tapi masih tidak bisa login ke Prosys sejak pagi ini.');
  await page.screenshot({ path: out('63-user-form-filled.png'), fullPage: true });
  logSection('Form filled');

  // Submit
  await page.click('.modal-footer button:has-text("Buat Tiket"), .modal-footer button:has-text("Kirim"), .modal-footer button:has-text("Submit")').catch(async()=>{
    const btns = await page.locator('.modal-footer button').allInnerTexts();
    console.log('MODAL FOOTER BUTTONS:', JSON.stringify(btns));
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: out('64-user-after-submit.png'), fullPage: true });
  logSection('After submit');

  // Tiket Saya
  await page.click('text=Tiket Saya');
  await page.waitForTimeout(800);
  await page.screenshot({ path: out('65-user-tiket-saya.png'), fullPage: true });
  logSection('Tiket Saya');

  // Knowledge Base
  await page.click('text=Knowledge Base');
  await page.waitForTimeout(800);
  await page.screenshot({ path: out('66-user-kb.png'), fullPage: true });
  logSection('Knowledge Base');

  // Click first KB article to expand
  await page.click('[class*="kb"] *:has-text("Cara")').catch(()=>{});
  await page.locator('text=/Cara/').first().click().catch(()=>{});
  await page.waitForTimeout(600);
  await page.screenshot({ path: out('67-user-kb-article.png'), fullPage: true });
  logSection('KB article expanded');

  await browser.close();
})();
