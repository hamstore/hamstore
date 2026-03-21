import type { Options } from 'tsdown';

const tsEntry = ['src/**/*.ts', '!src/**/*.test.ts'];
const tsxEntry = [
  'src/**/*.ts',
  'src/**/*.tsx',
  '!src/**/*.test.ts',
  '!src/**/*.test.tsx',
];

const jsConfig = (entry: string[]): Options => ({
  entry,
  unbundle: true,
  fixedExtension: true,
  sourcemap: true,
  clean: true,
  format: ['esm', 'cjs'],
  dts: false,
  outputOptions(options, format) {
    options.dir = format === 'es' ? 'dist/esm' : 'dist/cjs';
  },
  tsconfig: './tsconfig.build.json',
});

const dtsConfig = (entry: string[]): Options => ({
  entry,
  unbundle: true,
  fixedExtension: false,
  format: 'esm',
  outDir: 'dist/types',
  dts: { emitDtsOnly: true },
  tsconfig: './tsconfig.build.json',
});

export const baseConfig: Options[] = [
  jsConfig(tsEntry),
  dtsConfig(tsEntry),
];

export const reactConfig: Options[] = [
  jsConfig(tsxEntry),
  dtsConfig(tsxEntry),
];
