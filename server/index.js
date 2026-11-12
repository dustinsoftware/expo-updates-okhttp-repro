const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = Number(process.env.PORT || 9400);
const PUBLIC_URL = process.env.PUBLIC_URL || `http://10.0.2.2:${PORT}`;
const UPDATES_ROOT = path.resolve(__dirname, '..', 'updates');

const CONTENT_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ttf: 'font/ttf',
  otf: 'font/otf',
  json: 'application/json',
};

function hash(buffer, algorithm, encoding) {
  return crypto.createHash(algorithm).update(buffer).digest(encoding);
}

function toBase64Url(base64) {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sha256HexToUuid(hex) {
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
}

function log(message) {
  console.log(`${new Date().toISOString()} ${message}`);
}

function latestUpdateDir(runtimeVersion) {
  const runtimeDir = path.join(UPDATES_ROOT, runtimeVersion);
  if (!fs.existsSync(runtimeDir)) {
    return null;
  }
  const numbered = fs
    .readdirSync(runtimeDir)
    .filter((name) => /^\d+$/.test(name))
    .sort((a, b) => Number(b) - Number(a));
  return numbered.length > 0 ? path.join(runtimeDir, numbered[0]) : null;
}

function assetMetadata(updateDir, relativePath, ext, isLaunchAsset, runtimeVersion) {
  const contents = fs.readFileSync(path.join(updateDir, relativePath));
  const assetPath = path.relative(UPDATES_ROOT, path.join(updateDir, relativePath));
  return {
    hash: toBase64Url(hash(contents, 'sha256', 'base64')),
    key: hash(contents, 'md5', 'hex'),
    fileExtension: isLaunchAsset ? '.bundle' : `.${ext}`,
    contentType: isLaunchAsset
      ? 'application/javascript'
      : CONTENT_TYPES[ext] || 'application/octet-stream',
    url: `${PUBLIC_URL}/api/assets?asset=${encodeURIComponent(assetPath)}&runtimeVersion=${encodeURIComponent(runtimeVersion)}&platform=android`,
  };
}

function buildManifest(updateDir, runtimeVersion) {
  const metadataPath = path.join(updateDir, 'metadata.json');
  const metadataBuffer = fs.readFileSync(metadataPath);
  const metadata = JSON.parse(metadataBuffer.toString('utf8'));
  const androidMetadata = metadata.fileMetadata.android;
  const expoConfig = JSON.parse(fs.readFileSync(path.join(updateDir, 'expoConfig.json'), 'utf8'));
  return {
    id: sha256HexToUuid(hash(metadataBuffer, 'sha256', 'hex')),
    createdAt: fs.statSync(metadataPath).mtime.toISOString(),
    runtimeVersion,
    launchAsset: assetMetadata(updateDir, androidMetadata.bundle, null, true, runtimeVersion),
    assets: androidMetadata.assets.map((asset) =>
      assetMetadata(updateDir, asset.path, asset.ext, false, runtimeVersion),
    ),
    metadata: {},
    extra: { expoClient: expoConfig },
  };
}

function sendMultipart(res, partName, body) {
  const boundary = `repro-${crypto.randomBytes(8).toString('hex')}`;
  const payload = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="${partName}"`,
    'Content-Type: application/json; charset=utf-8',
    '',
    JSON.stringify(body),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  res.writeHead(200, {
    'expo-protocol-version': '1',
    'expo-sfv-version': '0',
    'cache-control': 'private, max-age=0',
    'content-type': `multipart/mixed; boundary=${boundary}`,
  });
  res.end(payload);
}

function sendError(res, status, message) {
  log(`  -> ${status} ${message}`);
  res.writeHead(status, { 'content-type': 'text/plain' });
  res.end(message);
}

function handleManifest(req, res, url) {
  const platform = req.headers['expo-platform'] || url.searchParams.get('platform');
  const runtimeVersion = req.headers['expo-runtime-version'] || url.searchParams.get('runtime-version');
  log(
    `MANIFEST request platform=${platform} runtimeVersion=${runtimeVersion} ` +
      `protocol=${req.headers['expo-protocol-version']} currentUpdateId=${req.headers['expo-current-update-id']}`,
  );
  if (platform !== 'android') {
    return sendError(res, 400, 'Only android is supported by this repro server');
  }
  const updateDir = runtimeVersion && latestUpdateDir(runtimeVersion);
  if (!updateDir) {
    return sendError(res, 404, `No update published for runtime version ${runtimeVersion}`);
  }
  const manifest = buildManifest(updateDir, runtimeVersion);
  if (req.headers['expo-current-update-id'] === manifest.id) {
    log(`  -> 200 noUpdateAvailable directive (already running ${manifest.id})`);
    return sendMultipart(res, 'directive', { type: 'noUpdateAvailable' });
  }
  log(
    `  -> 200 manifest id=${manifest.id} from ${path.relative(UPDATES_ROOT, updateDir)} ` +
      `(${manifest.assets.length} assets + launch asset)`,
  );
  return sendMultipart(res, 'manifest', manifest);
}

function handleAsset(req, res, url) {
  const asset = url.searchParams.get('asset') || '';
  const assetPath = path.resolve(UPDATES_ROOT, asset);
  log(`ASSET request ${asset}`);
  const isServableFile =
    assetPath.startsWith(UPDATES_ROOT + path.sep) &&
    fs.existsSync(assetPath) &&
    fs.statSync(assetPath).isFile();
  if (!isServableFile) {
    return sendError(res, 404, 'Asset not found');
  }
  const contents = fs.readFileSync(assetPath);
  log(`  -> 200 ${contents.length} bytes`);
  res.writeHead(200, { 'content-type': 'application/octet-stream' });
  return res.end(contents);
}

function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/manifest') {
    return handleManifest(req, res, url);
  }
  if (url.pathname === '/api/assets') {
    return handleAsset(req, res, url);
  }
  log(`OTHER request ${req.method} ${req.url}`);
  return sendError(res, 404, 'Not found');
}

const server = http.createServer((req, res) => {
  try {
    route(req, res);
  } catch (error) {
    console.error(error);
    sendError(res, 500, `Server error: ${error.message}`);
  }
});

server.listen(PORT, () => {
  log(`Update server listening on port ${PORT}, serving ${path.relative(process.cwd(), UPDATES_ROOT)}, public URL ${PUBLIC_URL}`);
});
