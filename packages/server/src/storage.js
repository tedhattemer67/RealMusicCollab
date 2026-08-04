// Local-disk storage adapter — the LOCAL case from the StorageAdapter enum.
// Google Drive / S3 adapters would live alongside this later, behind the
// same "get or create a default config, then read/write by storageKey" shape.
const fs = require('fs');
const path = require('path');
const prisma = require('./prisma');

// Files land in packages/server/local-storage — kept out of git (see .gitignore).
const LOCAL_ROOT = path.join(__dirname, '..', 'local-storage');

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

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

module.exports = { getOrCreateDefaultLocalConfig, ensureDir, LOCAL_ROOT };
