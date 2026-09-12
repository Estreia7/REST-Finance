import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: 'C:/Users/Estreia/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();

await p.goto('https://rest-finance.bruno-dev.xyz/?auth=login', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
await p.fill('input[type="email"]', 'demo@rest-finance.com');
await p.fill('input[type="password"]', 'demo-restaurant-2026');
await p.click('button[type="submit"]');
await p.waitForURL(/dashboard/, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(3500);

const state = await p.evaluate(() => ({
  url: location.pathname,
  rootClass: document.documentElement.className,
  stored: localStorage.getItem('rest-finance-theme'),
  colorScheme: document.documentElement.style.colorScheme,
  bodyBg: getComputedStyle(document.body).backgroundColor,
}));
console.log('dashboard:', JSON.stringify(state, null, 2));
await b.close();
