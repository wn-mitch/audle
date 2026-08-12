import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        extraFileExtensions: ['.svelte'],
        parser: tseslint.parser,
      },
    },
  },
  {
    ignores: [
      'dist/',
      '.svelte-check/',
      '.svelte-kit/',
      'node_modules/',
      'playwright-report/',
      'test-results/',
    ],
  },
  {
    files: ['**/*.ts', '**/*.svelte'],
    rules: {
      'no-console': 'off',
      'no-undef': 'off',
    },
  },
  {
    files: ['src/App.svelte'],
    rules: {
      'svelte/prefer-svelte-reactivity': 'off',
    },
  },
);
