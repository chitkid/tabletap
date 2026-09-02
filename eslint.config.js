import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/migrations/**', 'scripts/**', '**/*.cjs', '**/.claude/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node } } },
  { rules: { '@typescript-eslint/consistent-type-imports': 'error' } },
);
