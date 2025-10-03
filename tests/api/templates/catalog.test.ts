import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';


import { buildTemplateCatalog, TemplateCatalogEntry } from '../../../src/api/templates/catalog';

describe('buildTemplateCatalog', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'catalog-tests-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const writeTemplate = async (name: string, contents: string) => {
    await fs.writeFile(path.join(tmpDir, name), contents, 'utf8');
  };

  it('collects template metadata from yaml files', async () => {
    await writeTemplate(
      'deploy.yaml',
      [
        'version: 1',
        'name: Deploy Service',
        'description: Deploy the project to the requested environment',
        'params: [project, env]',
        'steps:',
        '  - action: run_shell',
        '    cmd: echo Deploying {project} to {env}',
      ].join('\n'),
    );

    await writeTemplate(
      'quick.yml',
      [
        'steps:',
        '  - action: noop',
      ].join('\n'),
    );

    await fs.writeFile(path.join(tmpDir, 'README.txt'), 'ignore me', 'utf8');

    const entries = await buildTemplateCatalog({ baseDir: tmpDir });
    const indexById: Record<string, TemplateCatalogEntry> = Object.fromEntries(
      entries.map((entry: TemplateCatalogEntry) => [entry.id, entry]),
    );

    expect(entries).toHaveLength(2);

    const deploy = indexById.deploy as TemplateCatalogEntry;
    expect(deploy).toBeDefined();
    expect(deploy.name).toBe('Deploy Service');
    expect(deploy.description).toContain('Deploy the project');
    expect(deploy.params).toEqual(['project', 'env']);
    expect(path.isAbsolute(deploy.file)).toBe(true);
    expect(deploy.file.endsWith(path.normalize('deploy.yaml'))).toBe(true);

    const quick = indexById.quick as TemplateCatalogEntry;
    expect(quick).toBeDefined();
    expect(quick.name).toBe('quick');
    expect(quick.description).toBeUndefined();
    expect(quick.params).toEqual([]);
    expect(quick.file.endsWith(path.normalize('quick.yml'))).toBe(true);
  });

  it('captures parse errors without throwing', async () => {
    await writeTemplate('broken.yaml', 'this: : : not valid');

    const entries = await buildTemplateCatalog({ baseDir: tmpDir });
    expect(entries).toHaveLength(1);

    const broken = entries[0];
    expect(broken.id).toBe('broken');
    expect(broken.error).toBeDefined();
    expect(broken.error).toMatch(/invalid/i);
  });

  it('returns empty list when directory does not exist', async () => {
    const entries = await buildTemplateCatalog({ baseDir: path.join(tmpDir, 'missing') });
    expect(entries).toEqual([]);
  });

  it('returns empty list when path exists but is not a directory', async () => {
    const filePath = path.join(tmpDir, 'single.yaml');
    await fs.writeFile(filePath, 'steps: []', 'utf8');

    const entries = await buildTemplateCatalog({ baseDir: filePath });
    expect(entries).toEqual([]);
  });

  it('rethrows unexpected errors from fs.stat', async () => {
    const fakeFs = ({
      ...(fs as unknown as Record<string, unknown>),
      stat: async () => {
        const error = Object.assign(new Error('boom'), { code: 'EACCES' });
        throw error;
      },
    } as unknown) as typeof import('node:fs/promises');

    await expect(buildTemplateCatalog({ baseDir: tmpDir, fs: fakeFs })).rejects.toThrow('boom');
  });
});
