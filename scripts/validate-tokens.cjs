#!/usr/bin/env node
/**
 * Validate token usage in the codebase.
 * Finds hardcoded values that should come from a design token.
 *
 * Usage:
 *   node scripts/validate-tokens.cjs --dir apps/
 *   node scripts/validate-tokens.cjs --dir packages/ui/src
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dir: null,
    ignore: ['node_modules', '.git', 'dist', 'build', '.next'],
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' || args[i] === '-d') {
      options.dir = args[++i];
    } else if (args[i] === '--ignore' || args[i] === '-i') {
      options.ignore.push(args[++i]);
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: node scripts/validate-tokens.cjs [options]

Options:
  -d, --dir <path>      Directory to scan (required)
  -i, --ignore <dir>    Additional directories to ignore
  -h, --help            Show this help

Checks for:
  - Hardcoded hex colors (#RGB, #RGBA, #RRGGBB, #RRGGBBAA), including inside
    Tailwind arbitrary values such as text-[#fff]
  - Hardcoded rgb() / rgba() / hsl() / hsla() colors
  - Hardcoded pixel values anywhere on the line, including Tailwind arbitrary
    values such as w-[300px]. Only 0 (unitless) and 1px are allowed
  - Hardcoded rem values, including gap-[1.5rem]

Not scanned:
  - packages/ui/tokens.css and packages/ui/theme.css - the token definitions
  - *.test.ts / *.test.tsx and friends - a test may name a colour it is asserting on
  - minified files and tailwind.config.*
      `);
      process.exit(0);
    }
  }

  return options;
}

const STYLESHEET_EXTENSIONS = new Set(['.css', '.scss']);
const BLACK_OR_WHITE = new Set(['#000', '#fff', '#000000', '#ffffff']);

/**
 * Patterns to detect hardcoded values.
 *
 * None of them requires a preceding colon: a raw value inside a Tailwind arbitrary utility
 * (`p-[13px]`, `text-[#fff]`) is exactly the case the earlier `:\s*` anchor let through.
 */
const patterns = {
  hexColor: {
    regex: /#(?:[0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})\b/g,
    message: 'Hardcoded hex color',
    suggestion: 'Use var(--color-*) token',
    // Black and white stay allowed in a stylesheet, where they are usually an overlay or a
    // shadow. In component source they have to be a token like anything else.
    allow: (match, ext) => STYLESHEET_EXTENSIONS.has(ext) && BLACK_OR_WHITE.has(match.toLowerCase()),
  },
  functionColor: {
    regex: /\b(?:rgba?|hsla?)\s*\(/gi,
    message: 'Hardcoded rgb()/rgba()/hsl()/hsla() color',
    suggestion: 'Use var(--color-*) token',
  },
  pixelValue: {
    regex: /(?<![\w.#-])\d*\.?\d+px\b/g,
    message: 'Hardcoded pixel value',
    suggestion: 'Use var(--space-*) or var(--radius-*) token; only 0 and 1px are allowed',
    allow: (match) => match === '1px',
  },
  remValue: {
    regex: /(?<![\w.#-])\d*\.?\d+rem\b/g,
    message: 'Hardcoded rem value',
    suggestion: 'Use var(--space-*) or var(--font-size-*) token',
  },
};

/**
 * File extensions to scan
 */
const extensions = ['.css', '.scss', '.tsx', '.jsx', '.ts', '.js', '.vue', '.svelte'];

/**
 * Files skipped by an exact path, relative to the repository root the script is run from.
 * These two are where the tokens are defined; everything else consumes them.
 */
const exactSkips = new Set(['packages/ui/tokens.css', 'packages/ui/theme.css']);

/**
 * Files skipped by shape.
 */
const skipPatterns = [/\.min\.(css|js)$/, /tailwind\.config/, /\.test\.[cm]?[jt]sx?$/];

/**
 * Get all files recursively
 */
function getFiles(dir, ignore, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!ignore.includes(entry.name)) {
        getFiles(fullPath, ignore, files);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (extensions.includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Check if file should be skipped
 */
function shouldSkip(filePath) {
  const relative = path.relative(process.cwd(), filePath).split(path.sep).join('/');
  if (exactSkips.has(relative)) return true;
  return skipPatterns.some((pattern) => pattern.test(filePath));
}

/**
 * Scan file for violations
 */
function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath);
  const lines = content.split('\n');
  const violations = [];

  lines.forEach((line, index) => {
    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('/*')) {
      return;
    }

    for (const [name, pattern] of Object.entries(patterns)) {
      for (const match of line.matchAll(pattern.regex)) {
        const value = match[0];
        if (pattern.allow && pattern.allow(value, ext)) continue;

        violations.push({
          file: filePath,
          line: index + 1,
          column: match.index + 1,
          value,
          type: name,
          message: pattern.message,
          suggestion: pattern.suggestion,
          context: line.trim().substring(0, 80),
        });
      }
    }
  });

  return violations;
}

/**
 * Format violation report
 */
function formatReport(violations) {
  if (violations.length === 0) {
    return 'No token violations found';
  }

  let report = `Found ${violations.length} potential token violations:\n\n`;

  // Group by file
  const byFile = {};
  violations.forEach((v) => {
    if (!byFile[v.file]) byFile[v.file] = [];
    byFile[v.file].push(v);
  });

  for (const [file, fileViolations] of Object.entries(byFile)) {
    report += `${file}\n`;
    fileViolations.forEach((v) => {
      report += `   Line ${v.line}: ${v.message}\n`;
      report += `   Found: ${v.value}\n`;
      report += `   Suggestion: ${v.suggestion}\n`;
      report += `   Context: ${v.context}\n\n`;
    });
  }

  // Summary
  const byType = {};
  violations.forEach((v) => {
    byType[v.type] = (byType[v.type] || 0) + 1;
  });

  report += `\nSummary:\n`;
  for (const [type, count] of Object.entries(byType)) {
    report += `   ${patterns[type].message}: ${count}\n`;
  }

  return report;
}

/**
 * Main
 */
function main() {
  const options = parseArgs();

  if (!options.dir) {
    console.error('Error: --dir is required');
    process.exit(1);
  }

  const dirPath = path.resolve(process.cwd(), options.dir);

  if (!fs.existsSync(dirPath)) {
    console.error(`Error: Directory not found: ${dirPath}`);
    process.exit(1);
  }

  console.log(`Scanning ${dirPath} for token violations...\n`);

  const files = getFiles(dirPath, options.ignore);
  const allViolations = [];

  for (const file of files) {
    if (shouldSkip(file)) continue;

    const violations = scanFile(file);
    allViolations.push(...violations);
  }

  console.log(formatReport(allViolations));

  // Exit with error code if violations found
  if (allViolations.length > 0) {
    process.exit(1);
  }
}

main();
