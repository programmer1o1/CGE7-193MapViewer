import { defineConfig, type RequestHandler } from '@rsbuild/core';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';
import { execSync } from 'node:child_process';
import { readdir } from 'node:fs';
import type { ServerResponse } from 'node:http';
import compression from 'compression';
import parseUrl from 'parseurl';
import send from 'send';

let gitCommit = '(unknown)';
try {
  gitCommit = execSync('git rev-parse --short HEAD').toString().trim();
} catch (e) {
  console.warn('Failed to fetch Git commit hash', e);
}

export default defineConfig({
  source: {
    entry: {
      index: './src/main.ts',
      embed: './src/main.ts',
    },
    // Legacy decorators are used with `reflect-metadata`.
    // TODO: Migrate to TypeScript 5.0 / TC39 decorators.
    decorators: {
      version: 'legacy',
    },
    define: {
      __COMMIT_HASH: JSON.stringify(gitCommit),
    },
  },
  html: {
    template: './src/index.html',
  },
  output: {
    target: 'web',
    assetPrefix: process.env.NODE_ENV === 'production' ? '/' : '/',
    // Mark Node.js built-in modules as external. `module` is referenced from
    // jolt-physics' Node-detection branch and never executes in the browser.
    externals: ['fs', 'path', 'url', 'module'],
    // TODO: These should be converted to use `new URL('./file.wasm', import.meta.url)`
    // so that the bundler can resolve them. In the meantime, they're expected to be
    // at the root.
    copy: [
      { from: 'src/**/*.wasm', to: '[name][ext]' },
      { from: 'node_modules/librw/lib/librw.wasm', to: 'static/js/[name][ext]' },
      { from: 'src/vendor/basis_universal/basis_transcoder.wasm', to: 'static/js/[name][ext]' },
    ],
  },
  // Enable async TypeScript type checking.
  plugins: [pluginTypeCheck()],
  tools: {
    rspack(_config) {
    },
    // Disable standards-compliant class field transforms.
    swc: {
      jsc: {
        transform: {
          useDefineForClassFields: false,
        },
      },
    },
  },
  // Disable fallback to index for 404 responses.
  server: {
    htmlFallback: false,
  },
  // Setup middleware to serve the `data` directory.
  dev: {
    setupMiddlewares: [
      (middlewares, _server) => {
        // Order matters: compression has to wrap the response BEFORE serveData
        // writes the body, so it goes first in the chain.
        middlewares.unshift(serveData);
        middlewares.unshift(compression({
          filter: (req, res) => {
            // Range requests get garbled by gzip — the middleware compresses
            // the full buffer and returns the byte range out of the COMPRESSED
            // stream, which the client interprets as raw uncompressed data
            // and gets nonsense. VPK chunks use Range headers heavily, so
            // skip compression whenever a range is requested.
            if (req.headers['range'])
              return false;
            const ct = res.getHeader('Content-Type');
            if (typeof ct === 'string' && /\b(image|video|audio)\/|application\/(zip|gzip|x-gzip|x-bzip2|x-7z)/.test(ct))
              return false;
            return compression.filter(req, res);
          },
        }) as any);
        return middlewares;
      },
    ],
    // Game assets in /data are large and stable per session, so let the
    // browser keep them aggressively. ETag (default) handles invalidation
    // when files change locally.
    headers: {
      'Cache-Control': 'public, max-age=3600',
    },
  },
});

// Serve files from the `data` directory.
const serveData: RequestHandler = (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }
  const matches = parseUrl(req)?.pathname?.match(/^\/data(\/.*)?$/);
  if (!matches) {
    next();
    return;
  }
  // The `send` package handles Range requests, conditional GET,
  // ETag generation, Cache-Control, Last-Modified, and more.
  const stream = send(req, matches[1] || '', {
    index: false,
    root: 'data',
  });
  stream.on(
    'directory',
    function handleDirectory(
      this: send.SendStream,
      res: ServerResponse,
      path: string,
    ) {
      // Print directory listing
      readdir(path, (err, list) => {
        if (err) return this.error(500, err);
        const filtered = list.filter((file) => !file.startsWith('.'));
        if (filtered.length === 0) return this.error(404);
        res.setHeader('Content-Type', 'text/plain; charset=UTF-8');
        res.end(`${filtered.join('\n')}\n`);
      });
    },
  );
  stream.pipe(res);
};
