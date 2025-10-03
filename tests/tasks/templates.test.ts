import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  loadTemplate,
  renderTemplate,
  loadAndRenderTemplate,
  TemplateError,
  TemplateSpec,
} from '../../src/tasks/templates';

describe('Template utilities', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'template-tests-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const writeTemplate = async (name: string, body: string) => {
    await fs.writeFile(path.join(tmpDir, `${name}.yaml`), body, 'utf8');
  };

  it('requires a template name', async () => {
    await expect(loadTemplate('', { baseDir: tmpDir })).rejects.toThrow(TemplateError);
  });

  it('loads a YAML template from disk', async () => {
    await writeTemplate(
      'build',
      [
        'version: 1',
        'name: build_project',
        'params: [project]',
        'steps:',
        '  - action: run_shell',
        '    cmd: echo "{project}"',
      ].join('\n'),
    );

    const spec = await loadTemplate('build', { baseDir: tmpDir });

    expect(spec.name).toBe('build_project');
    expect(spec.params).toEqual(['project']);
    expect(spec.steps).toHaveLength(1);
    expect(spec.steps[0]).toMatchObject({ action: 'run_shell', cmd: 'echo "{project}"' });
  });

  it('throws when a template file cannot be found', async () => {
    await expect(loadTemplate('missing', { baseDir: tmpDir })).rejects.toThrow(TemplateError);
  });

  it('throws when the YAML is invalid', async () => {
    await writeTemplate('broken', 'steps: [::::');
    await expect(loadTemplate('broken', { baseDir: tmpDir })).rejects.toThrow(TemplateError);
  });

  it('throws when the YAML is not an object', async () => {
    await writeTemplate('scalar', '42');
    await expect(loadTemplate('scalar', { baseDir: tmpDir })).rejects.toThrow(TemplateError);
  });

  it('throws when steps are not an array', async () => {
    await writeTemplate(
      'nosteps',
      [
        'name: broken',
        'steps: {}',
      ].join('\n'),
    );

    await expect(loadTemplate('nosteps', { baseDir: tmpDir })).rejects.toThrow(TemplateError);
  });

  it('renders template placeholders using provided params', () => {
    const spec: TemplateSpec = {
      name: 'build',
      params: ['project', 'workspace'],
      steps: [
        {
          action: 'run_shell',
          cmd: 'cd {workspace} && make {project}',
        },
        {
          action: 'verify_result',
          verifier: 'build.success',
          args: {
            project: '{project}',
            include: ['{project}', 'artifact'],
          },
        },
      ],
    };

    const rendered = renderTemplate(spec, { project: 'gvpie', workspace: '/srv/src' });

    expect(rendered.steps[0]).toMatchObject({
      cmd: 'cd /srv/src && make gvpie',
    });
    expect((rendered.steps[1] as Record<string, unknown>).args).toMatchObject({
      project: 'gvpie',
      include: ['gvpie', 'artifact'],
    });

    // Ensure source spec was not mutated
    expect(spec.steps[0]).toMatchObject({ cmd: 'cd {workspace} && make {project}' });
  });

  it('returns clone unchanged when no params declared', () => {
    const spec: TemplateSpec = {
      name: 'noop',
      steps: [{ action: 'noop', message: 'hello' }],
    };

    const rendered = renderTemplate(spec, {});
    expect(rendered.steps[0]).toEqual({ action: 'noop', message: 'hello' });
  });

  it('throws when a required parameter is missing', () => {
    const spec: TemplateSpec = {
      name: 'test',
      params: ['project'],
      steps: [
        { action: 'noop', note: 'Nothing to do {project}' },
      ],
    };

    expect(() => renderTemplate(spec, {})).toThrow(TemplateError);
  });

  it('supports combined load and render helper', async () => {
    await writeTemplate(
      'deploy',
      [
        'version: 1',
        'name: deploy',
        'params: [env, project]',
        'steps:',
        '  - action: run_shell',
        '    cmd: echo Deploying {project} to {env}',
      ].join('\n'),
    );

    const rendered = await loadAndRenderTemplate('deploy', { env: 'staging', project: 'gvpie' }, { baseDir: tmpDir });

    expect(rendered.steps[0]).toMatchObject({
      cmd: 'echo Deploying gvpie to staging',
    });
  });
});
