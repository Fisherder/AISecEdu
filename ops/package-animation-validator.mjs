import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

export function packageAnimationValidator(destination) {
  const origin = path.resolve('services/agent-runtime/package.json');
  const modules = path.join(destination, 'node_modules');
  const copied = new Map();
  fs.mkdirSync(modules, {recursive: true});
  function locate(name, from) {
    for (const directory of createRequire(from).resolve.paths(name + '/package.json') || []) {
      const candidate = path.join(directory, name, 'package.json');
      if (fs.existsSync(candidate)) return fs.realpathSync(path.dirname(candidate));
    }
    return null;
  }
  function copyPackage(source) {
    if (copied.has(source)) return copied.get(source);
    const metadata = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
    const key = metadata.name.replaceAll('/', '_') + '-' + metadata.version + '-' + crypto.createHash('sha256').update(source).digest('hex').slice(0, 10);
    const target = path.join(modules, '.packages', key);
    copied.set(source, target);
    fs.cpSync(source, target, {recursive: true, dereference: true, filter: name => !path.relative(source, name).split(path.sep).includes('node_modules')});
    for (const [name, optional] of new Map([
      ...Object.keys(metadata.peerDependencies || {}).map(name => [name, true]),
      ...Object.keys(metadata.optionalDependencies || {}).map(name => [name, true]),
      ...Object.keys(metadata.dependencies || {}).map(name => [name, false]),
    ])) {
      const dependency = locate(name, path.join(source, 'package.json'));
      if (!dependency) { if (optional) continue; throw new Error('Missing dependency: ' + name); }
      const copiedDependency = copyPackage(dependency);
      const link = path.join(target, 'node_modules', name);
      fs.mkdirSync(path.dirname(link), {recursive: true});
      fs.symlinkSync(path.relative(path.dirname(link), copiedDependency), link);
    }
    return target;
  }
  const eslint = copyPackage(locate('eslint', origin));
  fs.symlinkSync(path.relative(modules, eslint), path.join(modules, 'eslint'));
  const {Linter} = createRequire(path.join(destination, 'check.cjs'))('eslint');
  const result = new Linter().verify('missingFunction();', {rules: {'no-undef': 'error'}});
  if (result.length !== 1 || result[0].ruleId !== 'no-undef') throw new Error('Packaged validator failed');
  return {packages: copied.size, eslint: JSON.parse(fs.readFileSync(path.join(eslint, 'package.json'), 'utf8')).version};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(packageAnimationValidator(path.resolve(process.argv[2]))));
