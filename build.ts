import { build } from 'bun';
import {
	mkdirSync,
	readdirSync,
	statSync,
	writeFileSync,
	readFileSync,
	rmSync,
} from 'fs';
import { resolve, dirname } from 'path';
import { minify } from 'html-minifier';
import chalk from 'chalk';

function getFiles(baseDir: string, dir?: string, filesArr?: string[]) {
	dir = dir ?? baseDir;
	filesArr = filesArr ?? [];
	const files = readdirSync(dir);
	for (const file of files) {
		const name = resolve(dir, file);
		if (statSync(name).isDirectory()) {
			getFiles(baseDir, name, filesArr);
		} else {
			filesArr.push(name);
		}
	}
	return filesArr;
}

const srcDir = resolve(import.meta.dir, 'src');
const publicDir = resolve(
	import.meta.dir,
	process.env['BUILD_PATH'] ?? 'public',
);
const srcFiles = getFiles(resolve(import.meta.dir, 'src'));
const bundleFiles: string[] = [];
const minifyFiles: string[] = [];
const copyFiles: string[] = [];
const maxMinifySize = 10 * 1024 * 1024; // 10 MB
srcFiles.forEach((file) => {
	const strippedPath = file.replace(new RegExp(`^${srcDir}`), '');
	if (file.endsWith('.ts')) {
		bundleFiles.push(file);
	} else if (
		/\.(?:html|css|js|json)$/.test(strippedPath) &&
		!/^\/game\/.*(?:\/offline\.html|\/classes\.js)$/.test(strippedPath)
	) {
		const fileSize = statSync(file).size;
		if (fileSize > maxMinifySize) {
			copyFiles.push(file);
			console.log(
				chalk.yellow(
					`Skipping minification for large file: ${strippedPath} (${(
						fileSize / 1024 / 1024
					).toFixed(1)} MB)`,
				),
			);
		} else {
			minifyFiles.push(file);
		}
	} else {
		copyFiles.push(file);
	}
});

console.log(
	chalk.cyan(
		`Build plan: ${bundleFiles.length} TS files, ${minifyFiles.length} minify candidates, ${copyFiles.length} copy-only files.\n`,
	),
);
console.log(chalk.cyan('Removing old build artifacts...\n'));
rmSync(publicDir, { force: true, recursive: true });

console.log(chalk.cyan('Bundling TypeScript and modules...\n'));
await build({
	entrypoints: srcFiles.filter((file) => file.endsWith('.ts')),
	outdir: './public/',
	target: 'browser',
	root: './src/',
	minify: {
		syntax: true,
		whitespace: true,
		identifiers: false,
	},
});

console.log(chalk.cyan('Minifying HTML, JS, CSS, and JSON...\n'));
minifyFiles.forEach((file) => {
	const outputPath = file.replace(new RegExp(`^${srcDir}`), publicDir);
	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(
		outputPath,
		minify(readFileSync(file, 'utf-8'), {
			collapseWhitespace: true,
			removeComments: true,
			minifyCSS: true,
			minifyJS: true,
			continueOnParseError: true,
		}),
	);
});

console.log(chalk.cyan('Copying other files...\n'));
copyFiles.forEach((file) => {
	const outputPath = file.replace(new RegExp(`^${srcDir}`), publicDir);
	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, readFileSync(file));
});

console.log(chalk.cyan('Generating assets list...\n'));
const assetsJsonPath = resolve(publicDir, 'resources/data/assets.json');
mkdirSync(dirname(assetsJsonPath), { recursive: true });
writeFileSync(
	assetsJsonPath,
	JSON.stringify(
		getFiles(publicDir).map((asset) => {
			return asset
				.replace(new RegExp(`^${publicDir}`), '')
				.replace(/\/index\.html$/, '/');
		}),
	),
);

console.log(chalk.green('Build complete!\n'));
