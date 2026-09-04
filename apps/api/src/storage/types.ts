/** The ceiling the confirmation step enforces; see `presignPut` in `s3.ts` for why it is there. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoContentType = (typeof PHOTO_CONTENT_TYPES)[number];
/** Long enough for the browser to start the PUT, short enough that a leaked URL is worthless. */
export const PRESIGN_TTL_SECONDS = 60;

/** The extension `photoKey` gives each type, and the only endings a photo key may have. */
export const PHOTO_EXTENSIONS: Record<PhotoContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
/** A uuid, as a fragment so the key pattern can be built out of it. */
export const UUID_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const UUID_PATTERN = new RegExp(`^${UUID_SOURCE}$`, 'i');
/** `menu/<itemId>/<uuid>.<ext>` and nothing else - exactly what `photoKey` builds. */
const PHOTO_KEY_PATTERN = new RegExp(
  `^menu/(${UUID_SOURCE})/${UUID_SOURCE}\\.(?:${Object.values(PHOTO_EXTENSIONS).join('|')})$`,
  'i',
);

/**
 * True only for a key `photoKey(itemId, …)` could have produced. The shape lives here, in one
 * place, because two callers depend on it and a copy that drifted would be a hole: `presignPut`
 * signs nothing else, and the confirmation step must accept nothing else.
 *
 * A `startsWith('menu/<itemId>/')` test is not enough. `menu/<itemId>/../<otherId>/<uuid>.jpg`
 * passes it while leaving the item's folder: a backend that collapses dot segments resolves it to
 * another dish's object, and a browser normalises the `..` away before fetching, so a guest would
 * be served bytes this server never checked. The id is compared as a string, never interpolated
 * into the pattern, so a caller cannot smuggle a regex into it either.
 */
export function isPhotoKeyFor(itemId: string, key: string): boolean {
  const match = PHOTO_KEY_PATTERN.exec(key);
  return match !== null && match[1]!.toLowerCase() === itemId.toLowerCase();
}

export interface PresignedUpload {
  url: string;
  key: string;
  expiresInSeconds: number;
}
/** What a HeadObject tells us about an object that is there. */
export interface StoredObject {
  size: number;
  contentType: string | null;
}

/**
 * Why an upload was refused. `missing` means the browser never completed the PUT; the other two
 * mean it completed with something we will not serve, and the object has been deleted.
 */
export type UploadRejection = 'missing' | 'too-large' | 'unsupported-type';
export type UploadCheck =
  { ok: true; object: StoredObject } | { ok: false; reason: UploadRejection };

export interface ObjectStorage {
  /**
   * `menu/<itemId>/<uuid>.<ext>`. The name the browser gave the file never reaches the key: it is
   * attacker-controlled text, and a key built from it would carry the caller's path into the bucket.
   */
  photoKey(itemId: string, contentType: PhotoContentType): string;
  presignPut(key: string, contentType: PhotoContentType): Promise<PresignedUpload>;
  /** The size and type the object actually has, or null when there is no such object. */
  head(key: string): Promise<StoredObject | null>;
  /**
   * What the confirmation step calls before it writes the photograph onto an item. A presigned PUT
   * can pin the content type but not a size *ceiling*, so until this has run the object is an
   * unbounded file sitting in a world-readable prefix. Anything it refuses, it deletes.
   */
  checkUpload(key: string): Promise<UploadCheck>;
  exists(key: string): Promise<boolean>;
  publicUrl(key: string): string;
  remove(key: string): Promise<void>;
}
