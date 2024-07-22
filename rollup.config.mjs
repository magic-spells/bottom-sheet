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
    { file: 'dist/bottom-sheet.min.js', format: 'es', sourcemap: !isProd },
    { file: 'site/bottom-sheet.min.js', format: 'es', sourcemap: !isProd }
  ],
  plugins: [
    resolve(),
    commonjs(),
    isProd && terser(),  // JS minification
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
      minimize: false,  // we are using lightningcss instead
      sourceMap: isProd ? false : 'inline',
    }),
    !isProd && serve({
      open: true,
      contentBase: 'site', // The folder to serve files from
      port: 3000,
    }),
    !isProd && livereload({
      watch: 'site', // The folder to watch for changes
    }),
  ]
};
