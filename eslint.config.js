import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
// import tsdocPlugin from 'eslint-plugin-tsdoc';

export default tseslint.config(
	eslint.configs.recommended,
	tseslint.configs.eslintRecommended,
	...tseslint.configs.strict,
	...tseslint.configs.stylisticTypeChecked,
	eslintConfigPrettier,
	{
		ignores: ['tools/**'],
	},
	{
		/* plugins: {
			tsdoc: tsdocPlugin,
		}, */
		languageOptions: {
			parserOptions: {
				projectService: true,
				project: './tsconfig.json',
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'@typescript-eslint/ban-ts-comment': [
				'error',
				{
					'ts-expect-error': false,
					'ts-nocheck': false,
					'ts-check': true,
				},
			],
			// 'tsdoc/syntax': 'warn',
		},
	},
);
