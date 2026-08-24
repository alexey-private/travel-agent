// Next 16 removed `next lint`, so ESLint is invoked directly and needs a flat
// config. eslint-config-next@16 already ships flat config arrays.
const nextCoreWebVitals = require('eslint-config-next/core-web-vitals');

module.exports = [
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'] },
  ...nextCoreWebVitals,
];
