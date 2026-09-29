const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const openNextRoot = path.join(projectRoot, '.open-next');
const pagesRoot = path.join(openNextRoot, 'pages');
const assetsRoot = path.join(openNextRoot, 'assets');
const wranglerCli = path.join(
  projectRoot,
  'node_modules',
  'wrangler',
  'bin',
  'wrangler.js',
);
const workerConfig = path.join(projectRoot, 'wrangler.worker.jsonc');

function removeDanglingSymlinks(root) {
  if (!fs.existsSync(root)) return 0;

  let removed = 0;
  const entries = fs.readdirSync(root, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);

    if (entry.isSymbolicLink()) {
      try {
        fs.statSync(entryPath);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        fs.unlinkSync(entryPath);
        removed += 1;
      }
      continue;
    }

    if (entry.isDirectory()) {
      removed += removeDanglingSymlinks(entryPath);
    }
  }

  return removed;
}

if (!fs.existsSync(path.join(openNextRoot, 'worker.js'))) {
  throw new Error(
    'OpenNext worker not found. Run `opennextjs-cloudflare build` first.',
  );
}

fs.rmSync(pagesRoot, { recursive: true, force: true });
fs.mkdirSync(pagesRoot, { recursive: true });

// Wrangler follows and bundles the OpenNext module graph. Copying its raw
// server-functions directory into Pages also copies pnpm's dangling symlinks,
// which Pages rejects during asset validation.
const removedSymlinks = removeDanglingSymlinks(
  path.join(openNextRoot, 'server-functions'),
);
if (removedSymlinks > 0) {
  console.log(`Removed ${removedSymlinks} dangling pnpm symlink(s).`);
}

execFileSync(
  process.execPath,
  [
    wranglerCli,
    'deploy',
    '--dry-run',
    '--config',
    workerConfig,
    '--outdir',
    pagesRoot,
  ],
  { cwd: projectRoot, stdio: 'inherit' },
);

fs.renameSync(
  path.join(pagesRoot, 'worker.js'),
  path.join(pagesRoot, '_worker.js'),
);
fs.rmSync(path.join(pagesRoot, 'README.md'), { force: true });
fs.rmSync(path.join(pagesRoot, 'worker.js.map'), { force: true });

fs.cpSync(assetsRoot, pagesRoot, { recursive: true });

console.log(
  `Cloudflare Pages output prepared at ${path.relative(projectRoot, pagesRoot)}`,
);
