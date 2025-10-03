import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { loadVerifier, VerifierLoaderError, VerifierFunction } from '../../src/verifiers/loader';

describe('Verifier loader', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'verifier-loader-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const writeModule = async (moduleName: string, extension: string, contents: string) => {
    await fs.writeFile(path.join(tmpDir, `${moduleName}.${extension}`), contents, 'utf8');
  };

  it('loads a verifier function from a CommonJS module', async () => {
    await writeModule(
      'checks',
      'cjs',
      [
        'module.exports.build = (args, ctx) => ({',
        '  ok: true,',
        '  args,',
        '  taskId: ctx.taskId,',
        '});',
      ].join('\n'),
    );

    const verifier = (await loadVerifier('checks.build', { baseDirs: [tmpDir] })) as VerifierFunction;
    const result = await verifier({ path: 'dist/app' }, { taskId: 'task-123' });

    expect(result).toMatchObject({ ok: true, taskId: 'task-123', args: { path: 'dist/app' } });
  });

  it('falls back to import when require reports an ESM module', async () => {
    await writeModule('reports', 'js', 'export const noop = true;');

    const requireFn = jest.fn(() => {
      const err = new Error('esm module') as NodeJS.ErrnoException;
      err.code = 'ERR_REQUIRE_ESM';
      throw err;
    });
    const importFn = jest.fn(async () => ({ summarize: () => ({ ok: true }) }));

    const verifier = (await loadVerifier('reports.summarize', {
      baseDirs: [tmpDir],
      requireFn,
      importFn,
    })) as VerifierFunction;

    const result = await verifier({}, { taskId: 'task-999' });

    expect(requireFn).toHaveBeenCalled();
    expect(importFn).toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it('throws when the verifier cannot be found', async () => {
    await expect(loadVerifier('missing.check', { baseDirs: [tmpDir] })).rejects.toThrow(VerifierLoaderError);
  });

  it('throws when the exported member is not a function', async () => {
    await writeModule('invalid', 'cjs', 'module.exports.check = 42;');

    await expect(loadVerifier('invalid.check', { baseDirs: [tmpDir] })).rejects.toThrow(VerifierLoaderError);
  });
});
