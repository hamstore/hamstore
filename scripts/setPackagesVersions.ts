import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const newVersionTag = process.argv[2];

if (newVersionTag === undefined) {
  throw new Error('Please provide a version tag');
}

const PREFIXED_SEM_VER_REGEX =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const prefixedSemVerMatches = newVersionTag.match(PREFIXED_SEM_VER_REGEX);

if (
  !PREFIXED_SEM_VER_REGEX.test(newVersionTag) ||
  prefixedSemVerMatches === null
) {
  throw new Error(
    'Please provide a version tag that follows semantic versioning prefixed with v (e.g. "v1.2.3")',
  );
}

const [, NEW_SEM_VER_MAJOR, NEW_SEM_VER_MINOR, NEW_SEM_VER_PATCH, NEW_SEM_VER_PRERELEASE] = [
  ...prefixedSemVerMatches,
] as [string, string, string, string, string | undefined];

const NEW_SEM_VER = [
  NEW_SEM_VER_MAJOR,
  NEW_SEM_VER_MINOR,
  NEW_SEM_VER_PATCH,
].join('.') + (NEW_SEM_VER_PRERELEASE ? `-${NEW_SEM_VER_PRERELEASE}` : '');

type PackageJson = {
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

const packagesPath = join(__dirname, '..', 'packages');
const packagesNames = readdirSync(packagesPath);

packagesNames.forEach(packageName => {
  const packageJsonPath = join(packagesPath, packageName, 'package.json');

  const packageJson = JSON.parse(
    readFileSync(packageJsonPath).toString(),
  ) as PackageJson;

  packageJson.version = NEW_SEM_VER;

  const dependencies = packageJson.dependencies;
  if (dependencies !== undefined) {
    Object.keys(dependencies).forEach(dependencyName => {
      if (dependencyName.startsWith('@hamstore/')) {
        dependencies[dependencyName] = NEW_SEM_VER;
      }
    });
  }

  const peerDependencies = packageJson.peerDependencies;
  if (peerDependencies !== undefined) {
    Object.keys(peerDependencies).forEach(dependencyName => {
      if (dependencyName.startsWith('@hamstore/')) {
        peerDependencies[dependencyName] = `^${NEW_SEM_VER_MAJOR}.0.0`;
      }
    });
  }

  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
});
