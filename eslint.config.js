import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Scena 3D: gli oggetti three.js (materiali, uniform, piani) sono mutati imperativamente per design,
    // fuori dal ciclo di render React (useFrame): la regola del React Compiler non si applica.
    files: ['src/scene/**/*.{ts,tsx}'],
    rules: { 'react-hooks/immutability': 'off' },
  },
  {
    // Il motore fisiologico deve restare puro: nessuna dipendenza grafica o UI.
    files: ['src/physiology/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'three', '@react-three/*', 'zustand'],
              message: 'Il motore fisiologico non può dipendere da librerie grafiche/UI.',
            },
            {
              group: ['@scene/*', '@ui/*', '@store/*', '../scene/*', '../ui/*', '../store/*'],
              message: 'Il motore fisiologico non può importare scene/ui/store.',
            },
          ],
        },
      ],
    },
  },
);
