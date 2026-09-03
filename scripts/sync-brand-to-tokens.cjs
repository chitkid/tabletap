#!/usr/bin/env node
/**
 * sync-brand-to-tokens.cjs
 *
 * Rebuilds the three brand primitive colour scales in assets/design-tokens.json from the
 * colour tables in docs/brand-guidelines.md, then regenerates packages/ui/tokens.css.
 *
 * It writes `primitive.color.ember`, `primitive.color.olive` and `primitive.color.ink` and
 * nothing else. The neutral primitives, the semantic layer, the dark block and the component
 * layer are authored by hand in the JSON and are left exactly as they are.
 *
 * Usage:
 *   node scripts/sync-brand-to-tokens.cjs
 *   node scripts/sync-brand-to-tokens.cjs --dry-run
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Which brand role feeds which primitive scale. The brand document names the roles
// (Primary / Secondary / Accent); the token source names the hues.
const ROLE_PRIMITIVES = {
  primary: 'ember',
  secondary: 'olive',
  accent: 'ink',
};

// Paths, resolved from the repository root (the script is run from there).
const BRAND_GUIDELINES = 'docs/brand-guidelines.md';
const DESIGN_TOKENS_JSON = 'assets/design-tokens.json';
const TOKENS_CSS = 'packages/ui/tokens.css';
const GENERATE_TOKENS_SCRIPT = 'scripts/generate-tokens.cjs';

/**
 * Extract color info from brand guidelines markdown
 */
function extractColorsFromMarkdown(content) {
  const colors = {
    primary: {},
    secondary: {},
    accent: {},
  };

  // Match a "| Label | #hex |" markdown table row. Bold around the label
  // (**Label**) is optional, so this handles both plain and bolded variants.
  const rowRe = /\|\s*\*{0,2}([^*|]+?)\*{0,2}\s*\|\s*#([A-Fa-f0-9]{6})\b/g;

  // 1) Quick Reference table — hex only, no parenthesized name required.
  const quickRef = {
    primary: /Primary Color\s*\|\s*#([A-Fa-f0-9]{6})/i,
    secondary: /Secondary Color\s*\|\s*#([A-Fa-f0-9]{6})/i,
    accent: /Accent Color\s*\|\s*#([A-Fa-f0-9]{6})/i,
  };
  for (const key of Object.keys(quickRef)) {
    const m = content.match(quickRef[key]);
    if (m) colors[key].base = `#${m[1].toUpperCase()}`;
  }

  // 2) Dedicated "### <Role> Colors" tables — assign base/dark/light by the
  //    row label keyword.
  const assignFromSection = (heading, target) => {
    const section = content.match(new RegExp(`### ${heading}[\\s\\S]*?(?=\\n###|$)`, 'i'));
    if (!section) return;
    for (const m of section[0].matchAll(rowRe)) {
      const label = m[1].trim().toLowerCase();
      const hex = `#${m[2].toUpperCase()}`;
      if (label.includes('dark')) target.dark = hex;
      else if (label.includes('light')) target.light = hex;
      else if (!target.base) target.base = hex;
    }
  };
  assignFromSection('Primary Colors', colors.primary);
  assignFromSection('Secondary Colors', colors.secondary);
  assignFromSection('Accent Colors', colors.accent);

  return colors;
}

/**
 * Generate color scale from base color (simple approach)
 */
function generateColorScale(baseHex, darkHex, lightHex) {
  // Use provided shades or generate approximations
  return {
    50: { $value: lightHex || adjustBrightness(baseHex, 0.9), $type: 'color' },
    100: { $value: lightHex || adjustBrightness(baseHex, 0.8), $type: 'color' },
    200: { $value: adjustBrightness(baseHex, 0.6), $type: 'color' },
    300: { $value: adjustBrightness(baseHex, 0.4), $type: 'color' },
    400: { $value: adjustBrightness(baseHex, 0.2), $type: 'color' },
    500: { $value: baseHex, $type: 'color' },
    600: { $value: darkHex || adjustBrightness(baseHex, -0.15), $type: 'color' },
    700: { $value: adjustBrightness(baseHex, -0.3), $type: 'color' },
    800: { $value: adjustBrightness(baseHex, -0.45), $type: 'color' },
    900: { $value: adjustBrightness(baseHex, -0.6), $type: 'color' },
  };
}

/**
 * Adjust hex color brightness
 */
function adjustBrightness(hex, percent) {
  if (typeof hex !== 'string') return '#000000';
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + Math.round(255 * percent)));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + Math.round(255 * percent)));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + Math.round(255 * percent)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0').toUpperCase()}`;
}

/**
 * Rebuild the three brand scales in place. Every other key is left as it was.
 */
function updateDesignTokens(tokens, colors) {
  tokens.primitive = tokens.primitive || {};
  tokens.primitive.color = tokens.primitive.color || {};

  for (const [role, primitiveName] of Object.entries(ROLE_PRIMITIVES)) {
    const c = colors[role];
    if (!c || !c.base) {
      console.warn(`No base hex found for the ${role} role - leaving ${primitiveName} as it is.`);
      continue;
    }
    tokens.primitive.color[primitiveName] = generateColorScale(c.base, c.dark, c.light);
  }

  return tokens;
}

/**
 * Main
 */
function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('Syncing brand guidelines -> design tokens\n');

  // Read brand guidelines
  const guidelinesPath = path.resolve(process.cwd(), BRAND_GUIDELINES);
  if (!fs.existsSync(guidelinesPath)) {
    console.error(`Brand guidelines not found: ${guidelinesPath}`);
    process.exit(1);
  }
  const guidelinesContent = fs.readFileSync(guidelinesPath, 'utf-8');

  // Extract colors
  const colors = extractColorsFromMarkdown(guidelinesContent);
  for (const [role, primitiveName] of Object.entries(ROLE_PRIMITIVES)) {
    const c = colors[role];
    console.log(
      `   ${role} -> primitive.color.${primitiveName}: ${c.base} (dark ${c.dark ?? '-'}, light ${c.light ?? '-'})`,
    );
  }
  console.log('');

  // Read existing tokens
  const tokensPath = path.resolve(process.cwd(), DESIGN_TOKENS_JSON);
  if (!fs.existsSync(tokensPath)) {
    console.error(`Token source not found: ${tokensPath}`);
    process.exit(1);
  }
  const tokens = updateDesignTokens(
    JSON.parse(fs.readFileSync(tokensPath, 'utf-8')),
    colors,
  );

  if (dryRun) {
    console.log('Would update the three brand scales in design-tokens.json:');
    for (const primitiveName of Object.values(ROLE_PRIMITIVES)) {
      console.log(`   ${primitiveName}: ${tokens.primitive.color[primitiveName]['500'].$value}`);
    }
    console.log('\nDry run - no files changed');
    return;
  }

  // Write updated tokens
  fs.writeFileSync(tokensPath, `${JSON.stringify(tokens, null, 2)}\n`);
  console.log(`Updated: ${DESIGN_TOKENS_JSON}`);

  // Regenerate the stylesheet the apps consume.
  const generateScript = path.resolve(process.cwd(), GENERATE_TOKENS_SCRIPT);
  if (!fs.existsSync(generateScript)) {
    console.error(`Generator not found: ${generateScript}`);
    process.exit(1);
  }
  execFileSync('node', [generateScript, '--config', DESIGN_TOKENS_JSON, '-o', TOKENS_CSS], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  console.log(`Regenerated: ${TOKENS_CSS}`);

  console.log('\nBrand sync complete.');
}

main();
