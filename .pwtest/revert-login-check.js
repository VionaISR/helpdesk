const { chromium } = require('playwright');
const path = require('path');

const out = p => path.join(__dirname, p);

async function login(browser, { label, email, password, screenshotName }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const logs = [];
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') logs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => logs.push(`[pageerror] ${err.message}`));

  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);
  await page.waitForLoadState('networkidle');

  const url = page.url();
  const errorText = await page.locator('.login-error').first().textContent().catch(() => null);
  const session = await page.evaluate(() => localStorage.getItem('itlk_session'));

  console.log(`\n=== ${label} ===`);
  console.log('email:', email, '| password:', password);
  console.log('url after submit:', url);
  console.log('login-error text:', errorText);
  console.log('session in localStorage:', session);
  if (logs.length) console.log('console issues:\n' + logs.join('\n'));

  await page.screenshot({ path: out(screenshotName), fullPage: true });
  return { page, context, url, session, logs };
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // 1. Admin login
  const admin = await login(browser, {
    label: 'ADMIN viona@ithelpdesk.com',
    email: 'viona@ithelpdesk.com', password: 'IT@Viona2026',
    screenshotName: 'revert-01-admin-login.png',
  });
  // Visit Users/Account management page to confirm new emails show up
  await admin.page.goto('http://localhost:3000/admin');
  await admin.page.waitForLoadState('networkidle');
  await admin.page.waitForTimeout(500);
  const adminNavText = await admin.page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('admin page top text:', adminNavText.replace(/\n+/g, ' | '));
  await admin.page.screenshot({ path: out('revert-01b-admin-home.png'), fullPage: true });
  await admin.context.close();

  // 2. PIC login
  const pic = await login(browser, {
    label: 'PIC ivan.tenusa@ithelpdesk.com',
    email: 'ivan.tenusa@ithelpdesk.com', password: 'IT@IvanT2026',
    screenshotName: 'revert-02-pic-login.png',
  });
  await pic.page.waitForTimeout(500);
  const picHeaderText = await pic.page.evaluate(() => document.body.innerText.slice(0, 800));
  console.log('pic page top text:', picHeaderText.replace(/\n+/g, ' | '));
  await pic.context.close();

  // 3. User login (andi.pratama) - check seed tickets show under his new email
  const user = await login(browser, {
    label: 'USER andi.pratama@ithelpdesk.com',
    email: 'andi.pratama@ithelpdesk.com', password: 'IT@AndiP2026',
    screenshotName: 'revert-03-user-login.png',
  });
  await user.page.waitForTimeout(500);
  const userHeaderText = await user.page.evaluate(() => document.body.innerText.slice(0, 800));
  console.log('user dashboard top text:', userHeaderText.replace(/\n+/g, ' | '));
  await user.context.close();

  // 4. "Any password" behavior for a registered email
  const anyPw = await login(browser, {
    label: 'ANY-PASSWORD kevin@ithelpdesk.com',
    email: 'kevin@ithelpdesk.com', password: 'randomXYZ123-not-the-default',
    screenshotName: 'revert-04-any-password.png',
  });
  await anyPw.context.close();

  // 5. Unregistered email
  const bad = await login(browser, {
    label: 'UNREGISTERED nobody@ithelpdesk.com',
    email: 'nobody@ithelpdesk.com', password: 'whatever123',
    screenshotName: 'revert-05-unregistered.png',
  });
  await bad.context.close();

  await browser.close();
})();
