#!/usr/bin/env node
import { promises as fs } from 'fs';
import { join, extname, basename } from 'path';

const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', 'public/sw.js', 'public/sw-full.js']);

async function getFiles(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const files = [];
	for (const e of entries) {
		if (IGNORED.has(e.name)) continue;
		const full = join(dir, e.name);
		if (e.isDirectory()) files.push(...(await getFiles(full)));
		else files.push(full);
	}
	return files;
}

function formatHtml(src) {
	// break tags onto separate lines
	let out = src.replace(/>\s*</g, ">\n<");
	const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
	let indent = 0;
	const res = [];
	for (const line of lines) {
		const lower = line.toLowerCase();
		if (/^<\/[^>]+>/.test(lower)) {
			// closing tag
			indent = Math.max(0, indent - 1);
		}
		const ind = '  '.repeat(indent);
		res.push(ind + line);
		// self-closing, comments, doctypes don't change indent
		if (
			/^<!/.test(line) ||
			/^<\/?script\b/.test(lower) ||
			/^<\/?style\b/.test(lower)
		) {
			// leave as-is; scripts/styles may contain inner content so don't auto-adjust here
			continue;
		}
		// if opening tag that is not self-closing and not a closing tag, increase indent
		if (/^<[^\/!][^>]*[^\/]>/.test(line) && !/^<meta\b/.test(lower) && !/^<link\b/.test(lower) && !/^<br\b/.test(lower) && !/^<hr\b/.test(lower) && !/^<input\b/.test(lower)) {
			// if tag closes on same line like <div></div>, don't increment
			if (!/<[^>]+><\/[^>]+>/.test(line)) indent += 1;
		}
	}
	return res.join('\n') + '\n';
}

(async function main() {
	const root = process.cwd();
	const all = await getFiles(root);
	const htmlFiles = all.filter((f) => extname(f).toLowerCase() === '.html');
	let changed = 0;
	for (const file of htmlFiles) {
		try {
			const src = await fs.readFile(file, 'utf8');
			const formatted = formatHtml(src);
			if (formatted !== src) {
				await fs.writeFile(file, formatted, 'utf8');
				console.log('Formatted:', file.replace(root + '/', ''));
				changed++;
			}
		} catch (err) {
			console.error('Error:', file, err.message);
		}
	}
	console.log(`Done. Formatted ${changed} HTML file(s).`);
})();
