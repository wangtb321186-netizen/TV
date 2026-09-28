const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const openNextRoot = path.join(projectRoot, '.open-next');
const pagesRoot = path.join(openNextRoot, 'pages');
const assetsRoot = path.join(openNextRoot, 'assets');
const wranglerCli = path.join(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const workerConfig = path.join(projectRoot, 'wrangler.worker.jsonc');

if (!fs.existsSync(path.join(openNextRoot, 'worker.js'))) {
  throw new Error('OpenNext worker not found. Run `opennextjs-cloudflare build` first.');
}

fs.rmSync(pagesRoot, { recursive: true, force: true });
fs.mkdirSync(pagesRoot, { recursive: true });

// Wrangler follows and bundles the OpenNext module graph. Copying its raw
// server-functions directory into Pages also copies pnpm's dangling symlinks,
// which Pages rejects during asset validation.
execFileSync(process.execPath, [
  wranglerCli,
  'deploy',
  '--dry-run',
  '--config', workerConfig,
  '--outdir', pagesRoot,
], { cwd: projectRoot, stdio: 'inherit' });

fs.renameSync(
  path.join(pagesRoot, 'worker.js'),
  path.join(pagesRoot, '_worker.js'),
);
fs.rmSync(path.join(pagesRoot, 'README.md'), { force: true });
fs.rmSync(path.join(pagesRoot, 'worker.js.map'), { force: true });

fs.cpSync(assetsRoot, pagesRoot, { recursive: true });

console.log(`Cloudflare Pages output prepared at ${path.relative(projectRoot, pagesRoot)}`);
