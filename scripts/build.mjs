import { build, createServer } from 'vite';
import { rm, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import liveReload from '@magic-spells/vite-plugin-live-reload';

const isDev = process.env.NODE_ENV === 'development';
const outDir = isDev ? 'demo/dist' : 'dist';

// demo/vendor is committed so GitHub Pages can serve the demo without a
// bundler. Copying it by hand is what left the source map behind — the ESM
// bundle ends in a sourceMappingURL comment, so Vite reads a map that was
// never copied and warns on every dev start. Syncing here also stops an
// upgraded dependency from silently leaving a stale vendored copy.
const VENDOR_SRC = 'node_modules/@magic-spells/dialog-panel/dist';
const VENDOR_DIR = 'demo/vendor';
const VENDOR_FILES = ['dialog-panel.css', 'dialog-panel.esm.js', 'dialog-panel.esm.js.map'];

async function syncVendor() {
	if (!existsSync(VENDOR_SRC)) {
		console.warn(`vendor sync skipped — ${VENDOR_SRC} is not installed`);
		return;
	}

	await mkdir(VENDOR_DIR, { recursive: true });

	for (const file of VENDOR_FILES) {
		const from = `${VENDOR_SRC}/${file}`;

		if (!existsSync(from)) {
			console.warn(`vendor sync skipped ${file} — not published by the dependency`);
			continue;
		}

		await copyFile(from, `${VENDOR_DIR}/${file}`);
	}
}

function sharedBuild(overrides = {}) {
	return {
		configFile: false,
		logLevel: isDev ? 'warn' : 'info',
		css: { transformer: 'lightningcss' },
		build: {
			outDir,
			emptyOutDir: false,
			sourcemap: true,
			target: 'es2022',
			reportCompressedSize: !isDev,
			watch: isDev ? {} : null,
			...overrides.build,
		},
		...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'build')),
	};
}

function esmConfig({ emitCss = false } = {}) {
	return sharedBuild({
		build: {
			lib: {
				entry: 'src/bottom-sheet.js',
				fileName: () => 'bottom-sheet.esm.js',
				formats: ['es'],
				...(emitCss ? { cssFileName: 'bottom-sheet' } : {}),
			},
			minify: false,
			cssMinify: emitCss ? false : undefined,
			rolldownOptions: {
				output: { exports: 'named' },
			},
		},
	});
}

function umdConfig() {
	return sharedBuild({
		build: {
			lib: {
				entry: 'src/bottom-sheet.js',
				name: 'BottomSheet',
				fileName: () => 'bottom-sheet.js',
				formats: ['umd'],
			},
			minify: false,
			rolldownOptions: {
				output: { exports: 'named' },
			},
		},
	});
}

function cjsConfig() {
	return sharedBuild({
		build: {
			lib: {
				entry: 'src/bottom-sheet.js',
				fileName: () => 'bottom-sheet.cjs.js',
				formats: ['cjs'],
			},
			minify: false,
			rolldownOptions: {
				output: { exports: 'named' },
			},
		},
	});
}

function umdMinConfig({ emitCss = false } = {}) {
	return sharedBuild({
		build: {
			lib: {
				entry: 'src/bottom-sheet.js',
				name: 'BottomSheet',
				fileName: () => 'bottom-sheet.min.js',
				formats: ['umd'],
				...(emitCss ? { cssFileName: 'bottom-sheet.min' } : {}),
			},
			minify: 'terser',
			terserOptions: {
				mangle: { keep_classnames: true, keep_fnames: false },
			},
			cssMinify: emitCss ? 'lightningcss' : undefined,
			rolldownOptions: {
				output: { exports: 'named' },
			},
		},
	});
}

async function main() {
	if (!isDev) {
		await rm(outDir, { recursive: true, force: true });
		await mkdir(outDir, { recursive: true });
	} else if (!existsSync(outDir)) {
		await mkdir(outDir, { recursive: true });
	}

	await syncVendor();

	const configs = isDev
		? [esmConfig({ emitCss: true }), umdConfig()]
		: [esmConfig({ emitCss: true }), umdMinConfig({ emitCss: true }), umdConfig(), cjsConfig()];

	if (isDev) {
		for (const config of configs) {
			build(config).catch((error) => {
				console.error('build error:', error);
			});
		}

		const server = await createServer({
			configFile: false,
			root: 'demo',
			// Bound to every interface so the demo can be driven from a real
			// phone — touch gesture behaviour cannot be judged from a desktop
			// pointer. printUrls() then lists the LAN address to open.
			server: { port: 3080, open: true, strictPort: false, host: true },
			plugins: [liveReload('demo/dist')],
		});
		await server.listen();
		server.printUrls();
	} else {
		for (const config of configs) {
			await build(config);
		}
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
