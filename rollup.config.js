import resolve  from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace  from '@rollup/plugin-replace';
import terser   from '@rollup/plugin-terser';
import { config } from 'dotenv';

config(); // читає .env

const isProd = process.env.NODE_ENV === 'production';

// ── Custom CSS plugin ──────────────────────────────────────────────────────
// Трансформує CSS-імпорти в JS-модулі (export default 'css string')
// і одночасно виводить об'єднаний CSS-файл у dist/
function cssPlugin(outputFileName) {
  const chunks = [];
  return {
    name: 'css-string',
    transform(code, id) {
      if (!id.endsWith('.css')) return null;
      chunks.push(code);
      return {
        code: `export default ${JSON.stringify(code)};`,
        map:  { mappings: '' },
      };
    },
    generateBundle() {
      if (outputFileName && chunks.length) {
        this.emitFile({
          type:     'asset',
          fileName: outputFileName,
          source:   chunks.join('\n'),
        });
      }
    },
  };
}

// ── Shared plugins ─────────────────────────────────────────────────────────
const sharedPlugins = (cssOut) => [
  cssPlugin(cssOut),
  resolve({ browser: true }),
  commonjs(),
  replace({
    preventAssignment: true,
    'process.env.IQAIR_KEY':  JSON.stringify(process.env.IQAIR_KEY  || ''),
    'process.env.OPENAQ_KEY': JSON.stringify(process.env.OPENAQ_KEY || ''),
    'process.env.NODE_ENV':   JSON.stringify(process.env.NODE_ENV   || 'development'),
  }),
  isProd && terser(),
].filter(Boolean);

// ── Build configs ──────────────────────────────────────────────────────────
export default [
  // IIFE — для <script src="eco-widget.js">
  {
    input: 'src/index.js',
    output: {
      file:      'dist/eco-widget.js',
      format:    'iife',
      name:      'EcoWidget',
      sourcemap: !isProd,
    },
    plugins: sharedPlugins('eco-widget.css'),
  },
  // ESM — для import або bundler
  {
    input: 'src/index.js',
    output: {
      file:      'dist/eco-widget.esm.js',
      format:    'es',
      sourcemap: !isProd,
    },
    plugins: sharedPlugins(null), // CSS вже виведено в IIFE build
  },
];
