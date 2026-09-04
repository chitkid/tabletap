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
  const shared = {
    region: config.S3_REGION,
    forcePathStyle: config.S3_FORCE_PATH_STYLE === 'true',
    // Otherwise the SDK hoists a CRC32 of the *empty* body into every presigned URL, and the
    // browser - which sends a real body and computes no checksum - gets its PUT rejected.
    requestChecksumCalculation: 'WHEN_REQUIRED' as const,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID!,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY!,
    },
  };
  const client = new S3Client({ ...shared, endpoint });
  // SigV4 signs the Host header, so an upload URL is only usable from wherever it was signed for.
  // Under Compose the API reaches MinIO at `minio:9000` while the browser reaches it on localhost,
  // and one client cannot be both. This second one never sends a request - `getSignedUrl` is local
  // arithmetic - so pointing it at an origin this process cannot dial is exactly right.
  const presignEndpoint = config.S3_PRESIGN_ENDPOINT ?? endpoint;
  const presignClient =
    presignEndpoint === endpoint ? client : new S3Client({ ...shared, endpoint: presignEndpoint });
  return createS3Storage({
    client,
    bucket,
    // A CDN or an R2 custom domain publishes the bucket somewhere else entirely; without one, the
    // objects are read straight off the endpoint, which is what path-style addressing gives us.
    publicBaseUrl: config.S3_PUBLIC_URL ?? `${endpoint.replace(/\/+$/, '')}/${bucket}`,
    presign: (command, options) => getSignedUrl(presignClient, command, options),
  });
}
export * from './types';
