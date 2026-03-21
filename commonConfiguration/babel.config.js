import fs from 'fs';
import path from 'path';

const reactPreset = ['@babel/preset-react', { runtime: 'automatic', development: false }];

const tsPreset = ['@babel/preset-typescript', { allowNamespaces: true, allowDeclareFields: true }];

const defaultPresets = [reactPreset, tsPreset];

const defaultIgnores = [/.*\/(.*\.|)test\.tsx?/, /node_modules/, /dist/];

const defaultPlugins = [
  [
    'module-resolver',
    {
      root: ['./src'],
      extensions: ['.ts', '.tsx'],
      alias: { '~': './src' },
    },
  ],
];

const addImportExtension = (ext, options = {}) => {
  const dotExt = ext.startsWith('.') ? ext : `.${ext}`;
  const srcFileExts = options.sourceFileExts || ['.ts', '.tsx', '.js'];
  const indexCandidates = srcFileExts.map(e => `index${e}`);

  const isRelative = s => s.startsWith('./') || s.startsWith('../');
  const hasExt = s => path.extname(s) !== '';

  const resolveFromFile = (filename, spec) =>
    path.resolve(path.dirname(filename), spec.replace(/\/$/, ''));

  const rewrite = (filename, spec) => {
    if (!isRelative(spec) || hasExt(spec)) {
      return spec;
    }

    const absBase = resolveFromFile(filename, spec);

    // Case 1: folder with index.*
    if (fs.existsSync(absBase) && fs.statSync(absBase).isDirectory()) {
      const hasIndex = indexCandidates.some(cand => fs.existsSync(path.join(absBase, cand)));
      if (hasIndex) {
        return `${spec.replace(/\/$/, '')}/index${dotExt}`;
      }
    }

    // Case 2: file without extension in source (foo.ts / foo.tsx / foo.js)
    const hasFileNoExt = srcFileExts.some(e => fs.existsSync(`${absBase}${e}`));
    if (hasFileNoExt) {
      return `${spec}${dotExt}`;
    }

    // Fallback: still append (keeps prior behavior)
    return `${spec}${dotExt}`;
  };

  return {
    name: `add-import-extension-${ext}`,
    visitor: {
      ImportDeclaration: (p, state) => {
        const file = state.file.opts.filename;
        const v = p.node.source?.value;
        if (typeof v === 'string') {
          p.node.source.value = rewrite(file, v);
        }
      },
      ExportAllDeclaration: (p, state) => {
        const file = state.file.opts.filename;
        const v = p.node.source?.value;
        if (typeof v === 'string') {
          p.node.source.value = rewrite(file, v);
        }
      },
      ExportNamedDeclaration: (p, state) => {
        const file = state.file.opts.filename;
        const v = p.node.source?.value;
        if (typeof v === 'string') {
          p.node.source.value = rewrite(file, v);
        }
      },
      CallExpression: (p, state) => {
        // dynamic import('...')
        if (p.node.callee.type === 'Import' && p.node.arguments.length === 1) {
          const arg = p.node.arguments[0];
          if (arg.type === 'StringLiteral') {
            const file = state.file.opts.filename;
            arg.value = rewrite(file, arg.value);
          }
        }
      },
    },
  };
};

const presetsForESM = [['@babel/preset-env', { modules: false }], ...defaultPresets];

const presetsForCJS = [['@babel/preset-env', { modules: 'cjs' }], ...defaultPresets];

export default (plugins = []) => ({
  env: {
    // CJS build → outputs .cjs files, imports rewritten to .cjs
    cjs: {
      presets: presetsForCJS,
      // IMPORTANT: our plugin FIRST
      plugins: [addImportExtension('cjs'), ...plugins, ...defaultPlugins],
    },
    // ESM build → outputs .mjs files, imports rewritten to .mjs
    esm: {
      presets: presetsForESM,
      // IMPORTANT: our plugin FIRST
      plugins: [addImportExtension('mjs'), ...plugins, ...defaultPlugins],
    },
  },
  ignore: defaultIgnores,
});
