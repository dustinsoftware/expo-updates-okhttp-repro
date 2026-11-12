const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const updateNumber = process.argv[2];
if (!/^\d+$/.test(updateNumber || '')) {
  console.error('Usage: npm run publish-update -- <update number, e.g. 1>');
  process.exit(1);
}

const projectRoot = path.resolve(__dirname, '..');
const env = { ...process.env, EXPO_PUBLIC_BUNDLE_LABEL: `UPDATE ${updateNumber}` };
const expoConfig = JSON.parse(
  execFileSync('npx', ['expo', 'config', '--type', 'public', '--json'], {
    cwd: projectRoot,
    env,
    encoding: 'utf8',
  }),
);
const outputDir = path.join(projectRoot, 'updates', expoConfig.runtimeVersion, updateNumber);

fs.rmSync(outputDir, { recursive: true, force: true });
execFileSync(
  'npx',
  ['expo', 'export', '--platform', 'android', '--output-dir', outputDir, '--clear'],
  { cwd: projectRoot, env, stdio: 'inherit' },
);
fs.writeFileSync(path.join(outputDir, 'expoConfig.json'), JSON.stringify(expoConfig, null, 2));
console.log(`Published "UPDATE ${updateNumber}" for runtime ${expoConfig.runtimeVersion} to ${path.relative(projectRoot, outputDir)}`);
