import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import postcss from 'rollup-plugin-postcss';
import terser from '@rollup/plugin-terser';
import lightningcss from 'postcss-lightningcss';
import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';

const isProd = process.env.NODE_ENV === 'production';

export default {
  input: 'src/bottom-sheet.js',
  output: [
    {
      file: 'dist/bottom-sheet.min.js',
      format: 'iife',  // ES module format for modern JavaScript environments
      sourcemap: !isProd
    },
    {
      file: 'site/bottom-sheet.min.js',  // For testing or local development in the site folder
      format: 'iife',  // UMD format for browser
      name: 'BottomSheet',  // Global variable name in browsers
      sourcemap: !isProd
    }
  ],
  plugins: [
    resolve(),
    commonjs(),
    isProd && terser({
      mangle: {
        keep_classnames: true,  // Preserve class names during minification
        keep_fnames: true       // Optionally preserve function names as well
      }
    }),  // JS minification in production
    postcss({
      extensions: ['.scss', '.css'],
      plugins: [
        lightningcss({
          lightningcssOptions: {
            minify: isProd,
            sourcemap: !isProd,
          }
        })
      ],
      extract: 'bottom-sheet.min.css',
      minimize: false,  // Use lightningcss for minification
      sourceMap: isProd ? false : 'inline',
    }),
    serve({
      open: true,
      contentBase: 'site', // The folder to serve files from
      port: 3000,
    }),
    !isProd && livereload({
      watch: 'site', // The folder to watch for changes
    }),
  ]
};