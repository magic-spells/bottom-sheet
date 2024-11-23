import resolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import serve from "rollup-plugin-serve";
import copy from "rollup-plugin-copy";

const dev = process.env.ROLLUP_WATCH;

export default [
  // Development build
  {
    input: "src/bottom-sheet.js",
    output: {
      file: "dist/bottom-sheet.js",
      format: "iife",
      sourcemap: dev,
    },
    plugins: [
      resolve(),
      dev &&
        serve({
          contentBase: ["dist", "demo"],
          open: true,
          port: 3000,
        }),
      copy({
        targets: [{ src: "dist/bottom-sheet.js", dest: "demo" }],
        hook: "writeBundle",
      }),
    ],
  },
  // Production build (minified)
  {
    input: "src/bottom-sheet.js",
    output: {
      file: "dist/bottom-sheet.min.js",
      format: "iife",
      sourcemap: false,
    },
    plugins: [
      resolve(),
      terser({
        format: {
          comments: false,
        },
      }),
    ],
  },
];
