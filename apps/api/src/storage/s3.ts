import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import {
  PRESIGN_TTL_SECONDS,
  type ObjectStorage,
  type PhotoContentType,
  type StoredObject,
} from './types';

/** The slice of the SDK this adapter uses, so a test can hand it a fake and stay offline. */
export interface S3ClientLike {
  send(command: HeadObjectCommand): Promise<HeadObjectMetadata>;
  send(command: DeleteObjectCommand): Promise<unknown>;
}
export interface HeadObjectMetadata {
  ContentLength?: number | undefined;
  ContentType?: string | undefined;
}
/** `getSignedUrl` bound to its client, so a test can hand over a fake that opens no socket. */
export type PutPresigner = (
  command: PutObjectCommand,
  options: { expiresIn: number; signableHeaders: Set<string> },
) => Promise<string>;

const EXTENSIONS: Record<PhotoContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const UUID_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID = new RegExp(`^${UUID_SOURCE}$`, 'i');
/** Exactly what `photoKey` builds, so no route can hand `presignPut` a key of its own. */
const photoKeyPattern = (contentType: PhotoContentType) =>
  new RegExp(`^menu/${UUID_SOURCE}/${UUID_SOURCE}\\.${EXTENSIONS[contentType]}$`, 'i');

/**
 * A missing object. S3 answers HeadObject with `NotFound`; some compatible implementations say
 * `NoSuchKey` instead, and both carry the 404 that settles it either way.
 */
function isMissing(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { name, $metadata } = err as { name?: unknown; $metadata?: { httpStatusCode?: number } };
  return name === 'NotFound' || name === 'NoSuchKey' || $metadata?.httpStatusCode === 404;
}

export function createS3Storage(opts: {
  client: S3ClientLike;
  bucket: string;
  publicBaseUrl: string;
  presign: PutPresigner;
}): ObjectStorage {
  const base = opts.publicBaseUrl.replace(/\/+$/, '');
  return {
    photoKey(itemId, contentType) {
      // The route already validates the id, but the key is a security boundary: a `..` or a slash
      // reaching it would put the object outside the prefix the bucket policy makes public.
      if (!UUID.test(itemId)) throw new Error('photoKey needs a uuid item id');
      return `menu/${itemId}/${randomUUID()}.${EXTENSIONS[contentType]}`;
    },
    async presignPut(key, contentType) {
      // The one write the port hands out has to be for a key this port built. A route that passed
      // a key straight from a request body would otherwise let a signed-in member of staff write
      // anywhere in the bucket, under any name.
      if (!photoKeyPattern(contentType).test(key))
        throw new Error(`presignPut needs a photo key for ${contentType}`);
      // `signableHeaders` is what makes the content type binding: left to itself the presigner
      // signs only `host`, and a URL meant for a jpeg would happily take an HTML page that the
      // public menu/ prefix then serves back as text/html.
      //
      // The size has no such lever. SigV4 can sign an *exact* content-length, which a browser
      // cannot promise before it reads the file, and the `content-length-range` condition belongs
      // to presigned POST policies, not to a presigned PUT. So the 5 MB ceiling is checked against
      // `head` at the confirmation step instead.
      const url = await opts.presign(
        new PutObjectCommand({ Bucket: opts.bucket, Key: key, ContentType: contentType }),
        { expiresIn: PRESIGN_TTL_SECONDS, signableHeaders: new Set(['content-type']) },
      );
      return { url, key, expiresInSeconds: PRESIGN_TTL_SECONDS };
    },
    async head(key): Promise<StoredObject | null> {
      try {
        const out = await opts.client.send(
          new HeadObjectCommand({ Bucket: opts.bucket, Key: key }),
        );
        return { size: out.ContentLength ?? 0, contentType: out.ContentType ?? null };
      } catch (err) {
        if (isMissing(err)) return null;
        throw err;
      }
    },
    async exists(key) {
      return (await this.head(key)) !== null;
    },
    publicUrl(key) {
      return `${base}/${key}`;
    },
    async remove(key) {
      await opts.client.send(new DeleteObjectCommand({ Bucket: opts.bucket, Key: key }));
    },
  };
}
