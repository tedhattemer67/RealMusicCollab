// ============================================================
// Storage adapters — LOCAL and S3-compatible (AWS S3, Cloudflare R2,
// Backblaze B2, self-hosted MinIO — they all speak the same S3 API, so one
// implementation covers all four).
//
// Every route that reads or writes a file talks to the functions in this
// module, never to fs or the S3 client directly — that's what makes adding
// a future adapter (e.g. Google Drive) a change in one file, not five.
//
// Credentials are always read from environment variables, never stored in
// the StorageConfig.settings JSON column — that column holds non-secret
// config only (bucket name, region, endpoint).
// ============================================================

const fs = require('fs');
const path = require('path');
const prisma = require('./prisma');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const LOCAL_ROOT = path.join(__dirname, '..', 'local-storage');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function getOrCreateDefaultLocalConfig() {
  let config = await prisma.storageConfig.findFirst({
    where: { type: 'LOCAL', isDefault: true },
  });
  if (!config) {
    config = await prisma.storageConfig.create({
      data: {
        type: 'LOCAL',
        label: 'Default local storage',
        isDefault: true,
        settings: { rootPath: LOCAL_ROOT },
      },
    });
  }
  return config;
}

// STORAGE_ADAPTER=S3 (plus S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID,
// S3_SECRET_ACCESS_KEY, and optionally S3_ENDPOINT + S3_FORCE_PATH_STYLE for
// R2/B2/MinIO) switches every new upload to S3 with no code changes.
// Defaults to LOCAL, which self-creates with no configuration needed.
async function getDefaultStorageConfig() {
  const preferred = (process.env.STORAGE_ADAPTER || 'LOCAL').toUpperCase();

  if (preferred === 'S3') {
    let config = await prisma.storageConfig.findFirst({
      where: { type: 'S3', isDefault: true },
    });
    if (!config) {
      if (!process.env.S3_BUCKET) {
        throw new Error('STORAGE_ADAPTER=S3 is set but S3_BUCKET is missing.');
      }
      config = await prisma.storageConfig.create({
        data: {
          type: 'S3',
          label: process.env.S3_LABEL || 'S3 storage',
          isDefault: true,
          settings: {
            bucket: process.env.S3_BUCKET,
            region: process.env.S3_REGION || 'auto',
            endpoint: process.env.S3_ENDPOINT || null,
            forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
          },
        },
      });
    }
    return config;
  }

  return getOrCreateDefaultLocalConfig();
}

function getS3Client(settings) {
  return new S3Client({
    region: settings.region || 'auto',
    endpoint: settings.endpoint || undefined,
    forcePathStyle: !!settings.forcePathStyle,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
}

// Writes a buffer under a key prefix (a track id, song id, etc.) and returns
// the storageKey to save on the Take/Mix row. This is the one function every
// upload route calls — it doesn't need to know which adapter is active.
async function writeFile(storageConfig, keyPrefix, originalFilename, buffer) {
  const filename = `${Date.now()}-${originalFilename}`;
  const key = `${keyPrefix}/${filename}`;

  if (storageConfig.type === 'LOCAL') {
    const fullPath = path.join(LOCAL_ROOT, key);
    ensureDir(path.dirname(fullPath));
    fs.writeFileSync(fullPath, buffer);
    return key;
  }

  if (storageConfig.type === 'S3') {
    const client = getS3Client(storageConfig.settings);
    await client.send(
      new PutObjectCommand({ Bucket: storageConfig.settings.bucket, Key: key, Body: buffer })
    );
    return key;
  }

  throw new Error(`Storage adapter ${storageConfig.type} is not implemented yet.`);
}

// Returns { stream, size } for proxying — works for every adapter, used for
// LOCAL (which has no concept of a URL) and as the fallback for exports/ZIPs
// (archiver needs an actual stream, not a redirect).
async function getReadStream(storageConfig, key) {
  if (storageConfig.type === 'LOCAL') {
    const fullPath = path.join(LOCAL_ROOT, key);
    if (!fs.existsSync(fullPath)) return null;
    return { stream: fs.createReadStream(fullPath), size: fs.statSync(fullPath).size };
  }

  if (storageConfig.type === 'S3') {
    const client = getS3Client(storageConfig.settings);
    const res = await client.send(
      new GetObjectCommand({ Bucket: storageConfig.settings.bucket, Key: key })
    );
    return { stream: res.Body, size: res.ContentLength };
  }

  throw new Error(`Storage adapter ${storageConfig.type} is not implemented yet.`);
}

// Returns a short-lived signed URL for adapters that support handing the
// browser a direct link (S3), or null for adapters that don't (LOCAL) — the
// caller falls back to proxying via getReadStream when this returns null.
async function getRedirectUrl(storageConfig, key) {
  if (storageConfig.type !== 'S3') return null;
  const client = getS3Client(storageConfig.settings);
  const command = new GetObjectCommand({ Bucket: storageConfig.settings.bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: 60 * 5 }); // 5 minutes
}

module.exports = {
  LOCAL_ROOT,
  ensureDir,
  getOrCreateDefaultLocalConfig,
  getDefaultStorageConfig,
  writeFile,
  getReadStream,
  getRedirectUrl,
};
