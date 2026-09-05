# ADR 0012: Photographs live in object storage, uploaded by the browser

Date: 2026-09-05
Status: accepted

## Context

M5's brief asks an admin to put a photograph on a dish. [ADR 0007](0007-illustrated-menu.md) already provides for one — the generated plate is what a dish wears until it has a real picture — so what M5 adds is the act of getting the file there.

The obvious shape is a `multipart/form-data` POST to the API, which then writes the bytes somewhere. It is the wrong one here, and the reason is not taste. A menu photograph off a phone is two to five megabytes, and both deployment targets this project is written against cap a request body well below that: Vercel's serverless functions at 4.5 MB, Railway's edge proxy at a similar order. Even where the body fits, it is megabytes travelling through a Node process that has no use for them — held in memory, counted against the request timeout, and pointless, because the API's only interest in the file is whether it is an image of a plausible size.

The alternative is the one every object store is built for: the browser uploads straight to storage, and the API's part is limited to saying which key, which type, and for how long.

That leaves the question the shape creates. If the browser talks to the store directly, the API never sees the bytes — so what stops a client uploading a 500 MB file, or a `text/html` payload, or pointing a dish at an object belonging to someone else?

## Decision

**A presigned `PUT`, and the API chooses everything about the key.** `POST /api/menu/items/:id/photo-url` answers `{ url, key, expiresInSeconds }`. The key is `menu/<itemId>/<uuid>.<ext>`, built by `photoKey` in `apps/api/src/storage/s3.ts` from the item id and the content type — never from the file's own name, which is attacker-controlled text that would carry the caller's path into the bucket. The URL is signed for that one key, that one content type, and sixty seconds. `presignPut` re-derives the key shape and refuses to sign anything else, so the boundary is enforced twice by two different pieces of code.

The content type is genuinely bound, not merely suggested. It goes into the signature through the presigner's `signableHeaders`, so a browser that sends `content-type: text/html` against a URL signed for `image/jpeg` gets a signature mismatch from the store, not a 200 and a stored HTML file.

**No storage credential ever leaves the server.** The signature in the URL is the whole of what the browser is given, and it expires in a minute. There is no bucket name, no key id and no policy document on the client.

**A confirmation step, because a signature cannot express a ceiling.** SigV4 signs an exact `content-length` or none at all; it has no "at most" condition. So until the API has looked at the object, the upload is an unbounded file sitting in a world-readable prefix. `POST /api/menu/items/:id/photo` is what closes that:

1. The item must belong to the caller's restaurant — a 404 otherwise, the same rule as every other route in `menu-admin.ts`.
2. The key must be one `photoKey(id, …)` could have produced, tested with `isPhotoKeyFor` in `apps/api/src/storage/types.ts`.
3. `checkUpload(key)` does a `HeadObject` and refuses an object that is missing, over 5 MB, or not a JPEG, PNG or WebP — **and deletes whatever it refuses**, so a refusal is final for that key and a retry starts from a fresh `photo-url`.
4. Only then does `image_url` get written, and it is written from the server's own `publicUrl(key)` — never a URL the client supplied.

The prefix test is `isPhotoKeyFor`, not `key.startsWith('menu/' + id + '/')`, and the difference is the whole point of having it. `menu/<itemId>/../<otherId>/<uuid>.jpg` starts with this item's prefix and still leaves its folder: a backend that collapses dot segments resolves it to another dish's object, and a browser normalises the `..` away before fetching, so a guest would be served bytes this server never checked. Since the id inside the key is the one that just passed the ownership check, no object outside this dish's own folder can be confirmed — or even asked about.

**The `menu/` prefix is world-readable; nothing else in the bucket is.** A guest scans a QR code and gets a session with no identity and no S3 credentials, so the photograph on the menu has to be fetchable by an anonymous browser. The Compose init service opens exactly that prefix and no more:

```sh
mc anonymous set download "local/$S3_BUCKET/menu/"
```

**MinIO is the local implementation of the same API, not a local imitation of it.** `createObjectStorage` builds one `S3Client` from the AWS SDK v3; MinIO, S3 and R2 differ only in `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE` and `S3_PUBLIC_URL`. The code that runs against MinIO on a laptop is the code that would run against S3.

**Two views of the same MinIO, because SigV4 signs the Host header.** Under Compose the API dials MinIO at `minio:9000` while the browser reaches it on `localhost:9000`, and a URL signed for one host is refused at the other. `S3_PRESIGN_ENDPOINT` is the origin an upload URL is _signed_ for; a second client is built for it when it differs. That client never opens a socket — `getSignedUrl` is local arithmetic — so pointing it at an origin this process cannot dial is exactly right. It is deliberately not derived from `S3_PUBLIC_URL`, which may be a read-only CDN that accepts no writes.

## Consequences

- **One more service in Compose and in CI.** `minio` plus a one-shot `minio-init` that creates the bucket and opens the `menu/` prefix. The API waits on `minio: service_healthy` and on `minio-init: service_completed_successfully`, so the bucket exists before anything asks for a URL, and CI needs no wait of its own beyond the healthcheck Compose already gives it.
- **Four more required environment variables**, plus four with defaults. Required: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Optional: `S3_REGION`, `S3_PRESIGN_ENDPOINT`, `S3_PUBLIC_URL`, `S3_FORCE_PATH_STYLE`. Blank the four required ones and the API starts without photographs rather than failing to boot — `config.storageConfigured` is false, and the two photo routes answer 503 — which keeps host development possible for someone who does not want an object store running.
- **An upload nobody confirms is an orphan, and there is no sweep.** The browser can complete its `PUT` and then close the tab; the object stays under `menu/<itemId>/` with no row pointing at it. Two concurrent photo changes on one dish produce the same thing — the losing side's object is confirmed and then immediately superseded. Nothing deletes either. It is bounded (5 MB, and only staff with `menu.write` can mint a URL at all — twenty URLs a minute since the presign route took a rate limit) and it is on the backlog; a lifecycle rule on the prefix or a sweep that lists `menu/` against `image_url` is the fix.

- **The demo reset makes orphans on a timer, and it is the largest source of them.** `packages/db/src/seed/run.ts` empties the tables with `tx.delete(schema.menuItems)`, which never runs `deleteItem` — the only code that removes an object. `DEMO_RESET_INTERVAL_MINUTES` defaults to 60 in the deployed demo, so every photograph uploaded in an hour becomes an unreferenced, world-readable object at the end of it, for ever, with nothing to sweep it up. This is the one path where the count grows without anybody doing anything unusual. Also on the backlog, with the same two fixes.
- **A menu photograph is public by design.** Anyone who learns a key can read the object without a session, exactly as they can read the menu itself. The key contains two uuids, so it is not guessable, but it is not a secret either — it is one line in a public menu response. Nothing else in the bucket is readable, and no other prefix is used by this application.
- **A dish can point at a photograph the storage no longer has.** `image_url` is a plain column; if an object is deleted out from under it the guest menu shows a broken image rather than falling back to the generated plate. Deleting a dish through `deleteItem` removes its object, and replacing a photograph removes the previous one after the new row is committed — but those are the only two paths that do. Anything that deletes a `menu_items` row without going through `deleteItem` leaves the object behind, and the scheduled demo reset is exactly that, on a timer.
- **The confirmation is the only place size and type are decided, so it must not be skipped.** A future caller that writes `image_url` without going through `setItemPhoto` would reintroduce every hole this ADR closes. There is exactly one such writer today, and its tests cover the refusals by name.
