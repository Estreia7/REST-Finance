import { chromium } from 'playwright';

const CHROME = 'C:/Users/Estreia/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const BASE = 'https://rest-finance.bruno-dev.xyz';

const b = await chromium.launch({ executablePath: CHROME });

for (const theme of ['light', 'dark']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();

  await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await p.addInitScript((t) => localStorage.setItem('rest-finance-theme', t), theme);

  // Sign in as the demo owner through the real form.
  await p.goto(BASE + '/?auth=login', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  await p.fill('input[type="email"]', 'demo@rest-finance.com');
  await p.fill('input[type="password"]', 'demo-restaurant-2026');
  await p.click('button[type="submit"]');
  await p.waitForURL(/dashboard/, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(4000);

  await p.screenshot({ path: `/tmp/dash-${theme}.png` });

  // The analytics tab holds the charts.
  const analytics = p.locator('button:has-text("Análises"), button:has-text("Analytics")').first();
  if (await analytics.count()) {
    await analytics.click();
    await p.waitForTimeout(3500);
    await p.screenshot({ path: `/tmp/charts-${theme}.png` });
  }

  console.log(theme, 'captured:', p.url());
  await ctx.close();
}

await b.close();
