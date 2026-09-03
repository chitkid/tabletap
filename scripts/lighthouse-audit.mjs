#!/usr/bin/env node
/**
 * Lighthouse over the guest surface. Needs the stack running (docker compose up, or pnpm dev for api+web
 * with a database). Claims table 7 through the web origin so /menu is audited as a real guest.
 * Usage: node scripts/lighthouse-audit.mjs [--base http://localhost:3000] [--min-a11y 95] [--out docs/lighthouse-results.json]
 */
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import fs from 'node:fs';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const BASE = opt('base', 'http://localhost:3000');
const MIN_A11Y = Number(opt('min-a11y', '95'));
const OUT = opt('out', 'docs/lighthouse-results.json');

const links = await fetch(`${BASE}/api/demo/links`).then((r) => {
  if (!r.ok) throw new Error(`demo links: ${r.status}`);
  return r.json();
});
const token = new URL(links.guest.url).pathname.split('/t/')[1];
const claim = await fetch(`${BASE}/api/guest/claim`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ token }),
});
if (!claim.ok) throw new Error(`claim: ${claim.status}`);
const cookie = claim.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('claim returned no cookie');

const PAGES = [
  { slug: 'landing', path: '/', headers: undefined },
  { slug: 'menu', path: '/menu', headers: { Cookie: cookie } },
];
const chrome = await launch({
  chromePath: chromium.executablePath(),
  chromeFlags: ['--headless=new', '--no-sandbox'],
});
const results = [];
try {
  for (const page of PAGES) {
    const { lhr } = await lighthouse(`${BASE}${page.path}`, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices'],
      extraHeaders: page.headers,
    });
    const score = (c) => Math.round((lhr.categories[c]?.score ?? 0) * 100);
    results.push({
      slug: page.slug,
      url: lhr.finalDisplayedUrl,
      performance: score('performance'),
      accessibility: score('accessibility'),
      bestPractices: score('best-practices'),
      lcpMs: Math.round(lhr.audits['largest-contentful-paint']?.numericValue ?? 0),
      cls: lhr.audits['cumulative-layout-shift']?.numericValue ?? 0,
    });
  }
} finally {
  await chrome.kill();
}
console.table(results);
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2) + '\n',
);
const failing = results.filter((r) => r.accessibility < MIN_A11Y);
if (failing.length > 0) {
  console.error(
    `accessibility below ${MIN_A11Y}: ${failing.map((f) => `${f.slug}=${f.accessibility}`).join(', ')}`,
  );
  process.exit(1);
}
