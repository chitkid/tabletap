#!/usr/bin/env node
/**
 * Lighthouse over the guest surface and the kitchen board. Needs the stack running (docker compose up,
 * or pnpm dev for api+web with a database). Claims table 7 and signs in as the demo kitchen account
 * through the web origin, so /menu is audited as a real guest and /kitchen as real staff.
 * Usage: node scripts/lighthouse-audit.mjs [--base http://localhost:3000] [--min-a11y 95] [--out docs/lighthouse-results.json]
 * CHROME_PATH overrides the browser binary (chrome-launcher's own convention), e.g. when the
 * Playwright chrome.exe cannot start on a host but chrome-headless-shell.exe or Edge can.
 */
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import fs from 'node:fs';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq !== undefined) return eq.slice(name.length + 3);
  const i = args.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const value = args[i + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`--${name} needs a value (use --${name} <value> or --${name}=<value>)`);
  }
  return value;
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

// The kitchen board is behind the staff session, so the audit signs in the same way the login
// form does — through the web origin, so better-auth sees a trusted origin and the cookie it
// hands back is the one a browser on this host would carry.
const kitchenAccount = links.staff.find((s) => s.role === 'kitchen');
if (!kitchenAccount) throw new Error('demo links carry no kitchen account');
const signIn = await fetch(`${BASE}/api/auth/sign-in/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: BASE },
  body: JSON.stringify({ email: kitchenAccount.email, password: kitchenAccount.password }),
});
if (!signIn.ok) throw new Error(`kitchen sign-in: ${signIn.status}`);
// better-auth may set more than one cookie (session token plus its cached session data), and
// only the pairs matter in a Cookie header.
const staffCookie = signIn.headers
  .getSetCookie()
  .map((c) => c.split(';')[0])
  .join('; ');

const PAGES = [
  { slug: 'landing', path: '/', headers: undefined },
  { slug: 'menu', path: '/menu', headers: { Cookie: cookie } },
  { slug: 'kitchen', path: '/kitchen', headers: { Cookie: staffCookie } },
];
const chrome = await launch({
  chromePath: process.env.CHROME_PATH ?? chromium.executablePath(),
  chromeFlags: ['--headless=new', '--no-sandbox'],
});
const results = [];
const redirected = [];
try {
  for (const page of PAGES) {
    const { lhr } = await lighthouse(`${BASE}${page.path}`, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices'],
      extraHeaders: page.headers,
    });
    // A redirect is scored as whatever it landed on: an expired guest session sends /menu to
    // /session-ended, an almost empty page that would sail through every gate below.
    const finalPath = new URL(lhr.finalDisplayedUrl).pathname;
    if (finalPath !== page.path)
      redirected.push(`audited ${lhr.finalDisplayedUrl} instead of ${page.path}`);
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
// Reported after the results file is written, so a failed run still leaves its evidence.
if (redirected.length > 0) {
  for (const line of redirected) console.error(line);
  process.exit(1);
}
const failing = results.filter((r) => r.accessibility < MIN_A11Y);
if (failing.length > 0) {
  console.error(
    `accessibility below ${MIN_A11Y}: ${failing.map((f) => `${f.slug}=${f.accessibility}`).join(', ')}`,
  );
  process.exit(1);
}
