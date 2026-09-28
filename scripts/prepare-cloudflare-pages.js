const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const openNextRoot = path.join(projectRoot, '.open-next');
const pagesRoot = path.join(openNextRoot, 'pages');
const assetsRoot = path.join(openNextRoot, 'assets');

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

  fs.cpSync(
    path.join(openNextRoot, entry.name),
    path.join(pagesRoot, entry.name),
    { recursive: true },
  );
}

fs.cpSync(assetsRoot, pagesRoot, { recursive: true });
fs.copyFileSync(
  path.join(openNextRoot, 'worker.js'),
  path.join(pagesRoot, '_worker.js'),
);

console.log(`Cloudflare Pages output prepared at ${path.relative(projectRoot, pagesRoot)}`);
