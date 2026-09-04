import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { TEST_CONFIG } from '../test/helpers';
import { createObjectStorage } from './index';
import { createS3Storage, type HeadObjectMetadata, type PutPresigner } from './s3';
import { PHOTO_MAX_BYTES, PRESIGN_TTL_SECONDS } from './types';

const BUCKET = 'tabletap';
const PUBLIC = 'http://localhost:9000/tabletap';
const ITEM = '11111111-1111-4111-8111-111111111111';

/** Narrower than the real `send`, and assignable to it: the fake answers both commands. */
type FakeSend = (command: HeadObjectCommand | DeleteObjectCommand) => Promise<HeadObjectMetadata>;
const sendFn = () => vi.fn<FakeSend>();

/** A `NotFound` as `@aws-sdk/client-s3` raises it for a HeadObject on a key that is not there. */
function notFound(): Error {
  const err = new Error('NotFound');
  err.name = 'NotFound';
  return err;
}

function storageWith(
  opts: {
    send?: ReturnType<typeof sendFn>;
    presign?: ReturnType<typeof vi.fn<PutPresigner>>;
    publicBaseUrl?: string;
  } = {},
) {
  const send = opts.send ?? sendFn().mockResolvedValue({ ContentLength: 2048 });
  const presign =
    opts.presign ?? vi.fn<PutPresigner>().mockResolvedValue('http://localhost:9000/signed');
  const storage = createS3Storage({
    client: { send },
    bucket: BUCKET,
    publicBaseUrl: opts.publicBaseUrl ?? PUBLIC,
    presign,
  });
  return { storage, send, presign };
}

describe('photoKey', () => {
  it('names the object after the item and a fresh uuid, never after the upload', () => {
    const { storage } = storageWith();
    const key = storage.photoKey(ITEM, 'image/jpeg');
    expect(key).toMatch(
      new RegExp(
        `^menu/${ITEM}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.jpg$`,
      ),
    );
    expect(storage.photoKey(ITEM, 'image/jpeg')).not.toBe(key);
  });
  it('gives each accepted content type its own extension', () => {
    const { storage } = storageWith();
    expect(storage.photoKey(ITEM, 'image/png').endsWith('.png')).toBe(true);
    expect(storage.photoKey(ITEM, 'image/webp').endsWith('.webp')).toBe(true);
  });
  it('refuses an item id that is not a uuid, so no caller can shape the key', () => {
    const { storage } = storageWith();
    expect(() => storage.photoKey('../../etc/passwd', 'image/jpeg')).toThrow(/item id/i);
    expect(() => storage.photoKey(`${ITEM}/..`, 'image/jpeg')).toThrow(/item id/i);
  });
});

describe('presignPut', () => {
  it('signs a PUT for the bucket, the key and the content type, for 60 seconds', async () => {
    const { storage, presign } = storageWith();
    const key = `menu/${ITEM}/22222222-2222-4222-8222-222222222222.jpg`;
    const result = await storage.presignPut(key, 'image/jpeg');
    expect(result).toEqual({
      url: 'http://localhost:9000/signed',
      key,
      expiresInSeconds: PRESIGN_TTL_SECONDS,
    });
    expect(PRESIGN_TTL_SECONDS).toBe(60);
    const [command, options] = presign.mock.calls[0]!;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({ Bucket: BUCKET, Key: key, ContentType: 'image/jpeg' });
    expect(options.expiresIn).toBe(PRESIGN_TTL_SECONDS);
  });
  it('signs the content-type header, or the browser could store anything under an image key', async () => {
    const { storage, presign } = storageWith();
    await storage.presignPut(storage.photoKey(ITEM, 'image/jpeg'), 'image/jpeg');
    expect(presign.mock.calls[0]![1].signableHeaders).toEqual(new Set(['content-type']));
  });
  it('signs nothing but a key photoKey could have produced', async () => {
    const { storage, presign } = storageWith();
    for (const key of [
      'menu/../evil.html',
      'private/secrets.json',
      `menu/${ITEM}/photo.jpg`,
      `menu/${ITEM}/22222222-2222-4222-8222-222222222222.html`,
    ]) {
      await expect(storage.presignPut(key, 'image/jpeg')).rejects.toThrow(/key/i);
    }
    expect(presign).not.toHaveBeenCalled();
  });
  it('refuses a key whose extension disagrees with the content type it would be signed for', async () => {
    const { storage } = storageWith();
    await expect(
      storage.presignPut(storage.photoKey(ITEM, 'image/png'), 'image/jpeg'),
    ).rejects.toThrow(/key/i);
  });
});

describe('head', () => {
  it('reports the size the object actually has, so the ceiling can be checked on confirm', async () => {
    const send = sendFn().mockResolvedValue({ ContentLength: 4096, ContentType: 'image/png' });
    const { storage } = storageWith({ send });
    await expect(storage.head('menu/a/b.png')).resolves.toEqual({
      size: 4096,
      contentType: 'image/png',
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
  });
  it('answers null for an object that is not there', async () => {
    const { storage } = storageWith({ send: sendFn().mockRejectedValue(notFound()) });
    await expect(storage.head('menu/a/b.png')).resolves.toBeNull();
  });
});

describe('exists', () => {
  it('is true when the HeadObject resolves', async () => {
    const send = sendFn().mockResolvedValue({ ContentLength: 10 });
    const { storage } = storageWith({ send });
    await expect(storage.exists('menu/a/b.jpg')).resolves.toBe(true);
    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(HeadObjectCommand);
    expect(command?.input).toEqual({ Bucket: BUCKET, Key: 'menu/a/b.jpg' });
  });
  it('is false when the HeadObject rejects with NotFound', async () => {
    const { storage } = storageWith({ send: sendFn().mockRejectedValue(notFound()) });
    await expect(storage.exists('menu/a/b.jpg')).resolves.toBe(false);
  });
  it('rethrows anything that is not a missing object', async () => {
    const boom = new Error('connection refused');
    const { storage } = storageWith({ send: sendFn().mockRejectedValue(boom) });
    await expect(storage.exists('menu/a/b.jpg')).rejects.toThrow('connection refused');
  });
});

describe('remove', () => {
  it('deletes exactly the key it is given', async () => {
    const send = sendFn().mockResolvedValue({});
    const { storage } = storageWith({ send });
    await storage.remove('menu/a/b.jpg');
    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command?.input).toEqual({ Bucket: BUCKET, Key: 'menu/a/b.jpg' });
  });
});

describe('publicUrl', () => {
  it('hangs the key off the public base without doubling the slash', () => {
    expect(storageWith().storage.publicUrl('menu/a/b.jpg')).toBe(`${PUBLIC}/menu/a/b.jpg`);
    expect(storageWith({ publicBaseUrl: `${PUBLIC}/` }).storage.publicUrl('menu/a/b.jpg')).toBe(
      `${PUBLIC}/menu/a/b.jpg`,
    );
  });
  it('reads from S3_PUBLIC_URL when it is set', () => {
    const storage = createObjectStorage({
      ...TEST_CONFIG,
      S3_PUBLIC_URL: 'https://cdn.test/photos',
    });
    expect(storage.publicUrl('menu/a/b.jpg')).toBe('https://cdn.test/photos/menu/a/b.jpg');
  });
  it('falls back to the endpoint plus the bucket when it is not', () => {
    const storage = createObjectStorage(TEST_CONFIG);
    expect(storage.publicUrl('menu/a/b.jpg')).toBe(
      `${TEST_CONFIG.S3_ENDPOINT}/${TEST_CONFIG.S3_BUCKET}/menu/a/b.jpg`,
    );
  });
  it('refuses to build a storage that the environment has not configured', () => {
    expect(() => createObjectStorage({ ...TEST_CONFIG, storageConfigured: false })).toThrow(
      /not configured/i,
    );
  });
});

describe('checkUpload', () => {
  const KEY = `menu/${ITEM}/22222222-2222-4222-8222-222222222222.jpg`;
  /** HeadObject first, then the DeleteObject that a rejection makes. */
  const headThenDelete = (head: HeadObjectMetadata) =>
    sendFn().mockResolvedValueOnce(head).mockResolvedValueOnce({});

  it('accepts a photograph inside the ceiling and leaves it alone', async () => {
    const send = headThenDelete({ ContentLength: 1024, ContentType: 'image/jpeg' });
    const { storage } = storageWith({ send });
    await expect(storage.checkUpload(KEY)).resolves.toEqual({
      ok: true,
      object: { size: 1024, contentType: 'image/jpeg' },
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('accepts an object of exactly PHOTO_MAX_BYTES', async () => {
    const send = headThenDelete({ ContentLength: PHOTO_MAX_BYTES, ContentType: 'image/webp' });
    const { storage } = storageWith({ send });
    await expect(storage.checkUpload(KEY)).resolves.toMatchObject({ ok: true });
  });
  it('deletes an object over the ceiling and says so', async () => {
    const send = headThenDelete({ ContentLength: PHOTO_MAX_BYTES + 1, ContentType: 'image/jpeg' });
    const { storage } = storageWith({ send });
    await expect(storage.checkUpload(KEY)).resolves.toEqual({ ok: false, reason: 'too-large' });
    const deletion = send.mock.calls[1]?.[0];
    expect(deletion).toBeInstanceOf(DeleteObjectCommand);
    expect(deletion?.input).toEqual({ Bucket: BUCKET, Key: KEY });
  });
  it('deletes an object whose stored type is not one we serve', async () => {
    const send = headThenDelete({ ContentLength: 512, ContentType: 'text/html' });
    const { storage } = storageWith({ send });
    await expect(storage.checkUpload(KEY)).resolves.toEqual({
      ok: false,
      reason: 'unsupported-type',
    });
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(DeleteObjectCommand);
  });
  it('deletes an object that arrived with no type at all', async () => {
    const send = headThenDelete({ ContentLength: 512 });
    const { storage } = storageWith({ send });
    await expect(storage.checkUpload(KEY)).resolves.toEqual({
      ok: false,
      reason: 'unsupported-type',
    });
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(DeleteObjectCommand);
  });
  it('reports a key the browser never uploaded to, with nothing to delete', async () => {
    const send = sendFn().mockRejectedValue(notFound());
    const { storage } = storageWith({ send });
    await expect(storage.checkUpload(KEY)).resolves.toEqual({ ok: false, reason: 'missing' });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

/**
 * These read the URL the real presigner produces rather than the arguments it was handed, so an
 * SDK upgrade that renames or re-defaults an option cannot keep the suite green while quietly
 * dropping the guarantee. `getSignedUrl` with static credentials is local SigV4: no socket.
 */
describe('the signed URL itself', () => {
  const sign = async (config = TEST_CONFIG) => {
    const storage = createObjectStorage(config);
    const { url } = await storage.presignPut(storage.photoKey(ITEM, 'image/jpeg'), 'image/jpeg');
    return new URL(url);
  };

  it('binds the content type, lives 60 seconds and carries no checksum of an empty body', async () => {
    const params = (await sign()).searchParams;
    expect(params.get('X-Amz-SignedHeaders')?.split(';')).toContain('content-type');
    expect(params.get('X-Amz-Expires')).toBe(String(PRESIGN_TTL_SECONDS));
    expect([...params.keys()].filter((k) => k.toLowerCase().startsWith('x-amz-checksum-'))).toEqual(
      [],
    );
    expect(params.get('X-Amz-Signature')).toBeTruthy();
  });
  it('signs for the browser-facing endpoint, not the one only the API can reach', async () => {
    expect((await sign()).host).toBe('browser.test:9000');
  });
  it('signs for the API endpoint when no browser-facing one is named', async () => {
    const url = await sign({ ...TEST_CONFIG, S3_PRESIGN_ENDPOINT: undefined });
    expect(url.host).toBe('s3.test:9000');
  });
  it('keeps reads on the public base whichever endpoint signed the upload', () => {
    expect(createObjectStorage(TEST_CONFIG).publicUrl('menu/a/b.jpg')).toBe(
      `${TEST_CONFIG.S3_ENDPOINT}/${TEST_CONFIG.S3_BUCKET}/menu/a/b.jpg`,
    );
  });
});
