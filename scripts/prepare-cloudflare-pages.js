const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const openNextRoot = path.join(projectRoot, '.open-next');
const pagesRoot = path.join(openNextRoot, 'pages');
const assetsRoot = path.join(openNextRoot, 'assets');

function copyTree(source, destination) {
  // Pages uploads must contain regular files. OpenNext's pnpm runtime tree
  // can contain symlinks, so dereference them while preparing the output.
  fs.cpSync(source, destination, {
    recursive: true,
    dereference: true,
  });
}

if (!fs.existsSync(path.join(openNextRoot, 'worker.js'))) {
  throw new Error('OpenNext worker not found. Run `opennextjs-cloudflare build` first.');
}

fs.rmSync(pagesRoot, { recursive: true, force: true });
fs.mkdirSync(pagesRoot, { recursive: true });

// Pages Advanced Mode serves files from this directory and executes _worker.js
// for requests. Keep the OpenNext runtime modules beside the worker so its
// relative imports and dynamic server-function import continue to resolve.
for (const entry of fs.readdirSync(openNextRoot, { withFileTypes: true })) {
  if (entry.name === 'pages' || entry.name === 'assets' || entry.name === 'worker.js') {
    continue;
  }

  copyTree(
    path.join(openNextRoot, entry.name),
    path.join(pagesRoot, entry.name),
  );
}

copyTree(assetsRoot, pagesRoot);
fs.copyFileSync(
  path.join(openNextRoot, 'worker.js'),
  path.join(pagesRoot, '_worker.js'),
);

console.log(`Cloudflare Pages output prepared at ${path.relative(projectRoot, pagesRoot)}`);
