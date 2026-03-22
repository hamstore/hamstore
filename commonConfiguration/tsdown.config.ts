import type { Options } from 'tsdown';

const tsEntry = ['src/**/*.ts', '!src/**/*.test.ts'];
const tsxEntry = [
  'src/**/*.ts',
  'src/**/*.tsx',
  '!src/**/*.test.ts',
  '!src/**/*.test.tsx',
];

const base = (entry: string[]) =>
  ({
    entry,
    unbundle: true,
    sourcemap: true,
    outExtensions({ format }) {
      if (format === 'es') return { js: '.mjs', dts: '.d.ts' };
      return { js: '.cjs' };
    },
    tsconfig: './tsconfig.build.json',
  }) satisfies Options;

const createConfig = (entry: string[]): Options[] => [
  {
    ...base(entry),
    clean: true,
    format: { esm: { outDir: 'dist/esm' }, cjs: { outDir: 'dist/cjs' } },
    dts: false,
  },
  {
    ...base(entry),
    format: 'esm',
    outDir: 'dist/types',
    dts: { emitDtsOnly: true },
  },
];

export const baseConfig = createConfig(tsEntry);
export const reactConfig = createConfig(tsxEntry);
