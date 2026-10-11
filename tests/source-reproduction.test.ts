import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

function stage(root: string) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/reproduce-source.mjs'), '--distro=SourceOnlyTest'], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const events = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
  const staged = events.find(event => event.event === 'source-staged');
  const finished = events.find(event => event.event === 'reproduction-finished');
  assert.ok(staged && finished, 'source-only staging must finish');
  const manifest = JSON.parse(fs.readFileSync(finished.resultPath, 'utf8'));
  assert.equal(manifest.mode, 'stage-only');
  assert.deepEqual(manifest.commands, [], 'staging must not install, build or launch a runtime');
  return {root: staged.cleanRoot as string, manifest};
}

test('current source-only staging includes imported locale catalogs and no retired root page or runtime data', () => {
  const source = process.cwd(), staged = stage(source);
  const imported = [...fs.readFileSync(path.join(source, 'apps/web/src/i18n.ts'), 'utf8').matchAll(/from ['"](\.\/locales\/[^'"]+\.json)['"]/g)]
    .map(match => 'apps/web/src/' + match[1].slice(2));
  assert.ok(imported.length >= 3, 'exercise real current language imports');
  for (const file of imported) {
    const original = fs.readFileSync(path.join(source, file));
    assert.deepEqual(fs.readFileSync(path.join(staged.root, file)), original, file);
    assert.equal(staged.manifest.files.find((entry: {path: string}) => entry.path === file)?.sha256,
      createHash('sha256').update(original).digest('hex'));
  }
  assert.ok(fs.existsSync(path.join(staged.root, 'apps/web/index.html')));
  assert.equal(fs.existsSync(path.join(staged.root, 'index.html')), false);
  for (const file of staged.manifest.files as {path: string}[]) {
    assert.doesNotMatch(file.path, /(^|\/)(?:\.local|\.git|\.agents|\.codex|node_modules|target|dist|artifacts|wallets|keys|credentials)(\/|$)/);
    assert.doesNotMatch(file.path, /(?:^|\/)\.env|\.(?:sqlite|db|so|mp4)$/i);
  }

  // Attack the copied fixture, never the owner's working source or secrets.
  const forbidden = ['apps/web/src/locales/auth.json', 'apps/web/src/locales/ru-secret.json',
    'apps/web/src/locales/unrelated.json', 'apps/web/src/owner-auth.json', '.env',
    'apps/web/dist/private.js', 'server/.local/data.sqlite'];
  for (const file of forbidden) {
    const target = path.join(staged.root, file);
    fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, 'synthetic-not-a-credential');
  }
  const restaged = stage(staged.root);
  for (const file of forbidden) assert.equal(fs.existsSync(path.join(restaged.root, file)), false, file);
  for (const file of imported) assert.ok(fs.existsSync(path.join(restaged.root, file)), file);
});
