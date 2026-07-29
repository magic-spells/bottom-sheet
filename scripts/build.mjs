import { build, createServer } from 'vite';
import { rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import liveReload from '@magic-spells/vite-plugin-live-reload';

const isDev = process.env.NODE_ENV === 'development';
const outDir = isDev ? 'demo/dist' : 'dist';

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
			server: { port: 3080, open: true, strictPort: false },
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
