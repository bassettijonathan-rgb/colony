import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Simulation code must be deterministic and must not touch the browser. */
const simRules = {
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Use the seeded Rng from ctx.rng.' },
    { object: 'Date', property: 'now', message: 'The simulation never reads the clock; use world.tick.' },
    { object: 'performance', property: 'now', message: 'The simulation never reads the clock; use world.tick.' },
  ],
  'no-restricted-syntax': [
    'error',
    { selector: "NewExpression[callee.name='Date']", message: 'The simulation never reads the clock; use world.tick.' },
  ],
  'no-restricted-globals': [
    'error',
    { name: 'window', message: 'No browser code in core/ or modules/.' },
    { name: 'document', message: 'No browser code in core/ or modules/.' },
    { name: 'self', message: 'No browser code in core/ or modules/.' },
    { name: 'setTimeout', message: 'Use ticks, not real time.' },
    { name: 'setInterval', message: 'Use ticks, not real time.' },
  ],
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        { group: ['pixi.js', 'preact', 'preact/*'], message: 'No rendering or UI code in core/ or modules/.' },
        { group: ['**/render/*', '**/ui/*', '**/worker', '**/main'], message: 'Simulation code cannot import the page.' },
      ],
    },
  ],
};

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  { files: ['src/core/**/*.ts', 'src/modules/**/*.ts'], rules: simRules },
);
