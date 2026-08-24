// Next 16 removed `next lint`, so ESLint is invoked directly and needs a flat
// config. eslint-config-next@16 already ships flat config arrays.
const nextCoreWebVitals = require('eslint-config-next/core-web-vitals');

module.exports = [
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'] },
  ...nextCoreWebVitals,
  {
    rules: {
      // eslint-plugin-react-hooks@7 (pulled in by eslint-config-next 16) enables
      // React Compiler-aware rules that were never checked before. They flag
      // pre-existing patterns in useAsync/useStreamChat/usePushNotifications and
      // the three page-level data loaders. Fixing them means restructuring hook
      // behaviour, which does not belong in a dependency upgrade — kept as
      // warnings so the findings stay visible for a follow-up refactor.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
];
