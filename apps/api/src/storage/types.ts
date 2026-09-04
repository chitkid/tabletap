/** The ceiling the confirmation step enforces; see `presignPut` in `s3.ts` for why it is there. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoContentType = (typeof PHOTO_CONTENT_TYPES)[number];
/** Long enough for the browser to start the PUT, short enough that a leaked URL is worthless. */
export const PRESIGN_TTL_SECONDS = 60;

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
