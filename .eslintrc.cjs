/* eslint-env node */
// Restored ESLint config for this create-vue project (eslint 8 flat-config predates
// this toolchain; @vue/eslint-config-typescript@12 + eslint-plugin-vue@9 use the
// classic .eslintrc format). The @rushstack patch lets the shared config's plugins
// resolve from THIS package rather than needing to be hoisted.
//
// We extend the `skip-formatting` prettier config, NOT the formatting one: the code in
// this repo is hand-formatted (single quotes, no semicolons) and is not fully
// Prettier-clean at any single printWidth, so ESLint intentionally checks only real
// lint rules (unused vars, Vue template mistakes, etc.) and leaves whitespace/quotes to
// the developer. Run Prettier separately if/when a shared .prettierrc is adopted.
require('@rushstack/eslint-patch/modern-module-resolution')

module.exports = {
  root: true,
  extends: [
    'plugin:vue/vue3-essential',
    'eslint:recommended',
    '@vue/eslint-config-typescript',
    '@vue/eslint-config-prettier/skip-formatting',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
  },
  // Generated/build output — never lint it (the `lint` script omits the usual
  // `--ignore-path .gitignore`, so keep these here to be robust to any invocation).
  ignorePatterns: ['dist/', 'html/', 'coverage/', 'node_modules/'],
  overrides: [
    {
      // Node-side files (the e2e harness, Vite/tooling config) run under Node, not the
      // browser, so `process`/`Buffer`/etc. are expected globals rather than no-undef.
      files: ['e2e/**', '*.config.*', '*.cjs', '*.mjs'],
      env: { node: true },
    },
  ],
}
