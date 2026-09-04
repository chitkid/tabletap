import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Config } from '../config';
import { createS3Storage } from './s3';
import type { ObjectStorage } from './types';

export function createObjectStorage(config: Config): ObjectStorage {
  if (!config.storageConfigured) throw new Error('Object storage is not configured');
  // `storageConfigured` is what decides this: all four are present.
  const endpoint = config.S3_ENDPOINT!;
  const bucket = config.S3_BUCKET!;
  const client = new S3Client({
    region: config.S3_REGION,
    endpoint,
    forcePathStyle: config.S3_FORCE_PATH_STYLE === 'true',
    // Otherwise the SDK hoists a CRC32 of the *empty* body into every presigned URL, and the
    // browser - which sends a real body and computes no checksum - gets its PUT rejected.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID!,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY!,
    },
  });
  return createS3Storage({
    client,
    bucket,
    // A CDN or an R2 custom domain publishes the bucket somewhere else entirely; without one, the
    // objects are read straight off the endpoint, which is what path-style addressing gives us.
    publicBaseUrl: config.S3_PUBLIC_URL ?? `${endpoint.replace(/\/+$/, '')}/${bucket}`,
    presign: (command, options) => getSignedUrl(client, command, options),
  });
}
export * from './types';
