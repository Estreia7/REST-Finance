import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: 'C:/Users/Estreia/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();

await p.goto('https://rest-finance.bruno-dev.xyz/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2000);

const state = await p.evaluate(() => ({
  rootClass: document.documentElement.className,
  stored: localStorage.getItem('rest-finance-theme'),
  colorScheme: document.documentElement.style.colorScheme,
  bodyBg: getComputedStyle(document.body).backgroundColor,
  bgToken: getComputedStyle(document.documentElement).getPropertyValue('--background').trim(),
  prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
}));
console.log('landing:', JSON.stringify(state, null, 2));
await b.close();
