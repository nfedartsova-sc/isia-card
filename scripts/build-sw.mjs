import * as esbuild from 'esbuild';

const isDev = process.argv.includes('--dev');

await esbuild.build({
  entryPoints: ['src/sw.ts'],
  bundle: true,
  outfile: 'public/sw.js',
  format: 'iife', // Classic service worker format (not ES modules)
  minify: !isDev,
  sourcemap: isDev,
  target: ['chrome90', 'firefox88', 'safari14', 'edge90'],
  define: {
    'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
  },
  banner: {
    js: `// Service Worker built at ${new Date().toISOString()}\n`,
  },
});

console.log('✅ Service worker built successfully!');





