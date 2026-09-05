// @vitest-environment node
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { signVisitor, VISITOR_HEADER, VISITOR_SIG_HEADER } from './forward-signature';

const SECRET = 'forward-secret-for-tests-0123456789abcdef';

describe('signVisitor', () => {
  it('gives one address and one secret one signature, every time', async () => {
    // The API recomputes the signature over the address it was handed and compares. Nothing else
    // is transmitted, so a signature that varied between calls could never verify.
    const first = await signVisitor('203.0.113.10', SECRET);
    expect(await signVisitor('203.0.113.10', SECRET)).toBe(first);
  });

  it('gives a different address a different signature', async () => {
    // The property the API leans on: a caller cannot take a signature it has seen and reuse it
    // for an address of its choosing.
    expect(await signVisitor('203.0.113.11', SECRET)).not.toBe(
      await signVisitor('203.0.113.10', SECRET),
    );
  });

  it('gives a different secret a different signature', async () => {
    expect(await signVisitor('203.0.113.10', `${SECRET}-other`)).not.toBe(
      await signVisitor('203.0.113.10', SECRET),
    );
  });

  it('is hex-encoded HMAC-SHA256, which is what the API recomputes', async () => {
    // Pinned against an independent implementation rather than a golden string: the web signs
    // with Web Crypto and the API verifies with node:crypto, so the two must agree on the
    // algorithm and the encoding or every signature fails and every visitor shares one bucket.
    const signature = await signVisitor('203.0.113.10', SECRET);
    expect(signature).toBe(createHmac('sha256', SECRET).update('203.0.113.10').digest('hex'));
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it('signs through Web Crypto, because the edge runtime has no node:crypto', async () => {
    const sign = vi.spyOn(globalThis.crypto.subtle, 'sign');
    try {
      await signVisitor('203.0.113.10', SECRET);
      expect(sign).toHaveBeenCalled();
    } finally {
      sign.mockRestore();
    }
  });

  it('imports nothing from node:crypto, which would fail to bundle for the edge runtime', () => {
    // A build-time failure this test turns into a test-time one: middleware is bundled for the
    // edge runtime, where a `node:crypto` import does not resolve.
    const source = readFileSync(new URL('./forward-signature.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['"]node:crypto['"]/);
    expect(source).not.toMatch(/from ['"]crypto['"]/);
  });
});

describe('the header names', () => {
  it('are the two the API reads', () => {
    // Two apps, no shared module between them: `apps/api/src/lib/client-key.ts` spells these out
    // again and its own test pins the same literals. If one side is renamed alone, one of the two
    // tests fails rather than the demo silently losing per-visitor buckets.
    expect(VISITOR_HEADER).toBe('x-tt-visitor');
    expect(VISITOR_SIG_HEADER).toBe('x-tt-visitor-signature');
  });
});
