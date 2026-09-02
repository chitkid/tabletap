import nextVitals from 'eslint-config-next/core-web-vitals';
import base from '../../eslint.config.js';

const config = [
  ...base,
  ...nextVitals,
  { ignores: ['.next/**', 'next-env.d.ts'] },
  // eslint-config-next parses plain JS with its Babel parser, which offers no TypeScript
  // parser services; the type-aware import rule has nothing to check in a JS file anyway.
  {
    files: ['**/*.js', '**/*.mjs'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tabletap/shared/server'],
              message: 'Server-only: never import token signing into the web app.',
            },
          ],
        },
      ],
    },
  },
];
export default config;
