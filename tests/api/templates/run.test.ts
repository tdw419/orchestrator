import { TemplateSpec } from '../../../src/tasks/templates';
import { TemplateRunner, runTemplateTask } from '../../../src/api/templates/run';

describe('runTemplateTask', () => {
  const templateSpec: TemplateSpec = {
    name: 'deploy_service',
    params: ['project', 'env'],
    steps: [
      { action: 'run_shell', cmd: 'deploy {project} to {env}' },
    ],
  };

  const renderedSpec: TemplateSpec = {
    ...templateSpec,
    steps: [{ action: 'run_shell', cmd: 'deploy gvpie to staging' }],
  };

  it('loads, renders, and dispatches template steps', async () => {
    const load = jest.fn().mockResolvedValue(templateSpec);
    const render = jest.fn().mockResolvedValue(renderedSpec);
    const runSteps = jest.fn().mockResolvedValue({ taskId: 'task-123', status: 'queued' });

    const runner: TemplateRunner = {
      loadTemplate: load,
      renderTemplate: render,
      runSteps,
    };

    const result = await runTemplateTask({
      template: 'deploy',
      params: { project: 'gvpie', env: 'staging' },
      metadata: { goal: 'Deploy GVPIE to staging' },
      runner,
    });

    expect(load).toHaveBeenCalledWith('deploy');
    expect(render).toHaveBeenCalledWith(templateSpec, { project: 'gvpie', env: 'staging' });
    expect(runSteps).toHaveBeenCalledWith(renderedSpec.steps, {
      goal: 'Deploy GVPIE to staging',
      template: 'deploy',
      params: { project: 'gvpie', env: 'staging' },
    });
    expect(result).toEqual({ taskId: 'task-123', status: 'queued' });
  });

  it('throws when template name missing', async () => {
    await expect(
      runTemplateTask({
        template: '',
        params: {},
        runner: createNoopRunner(),
      }),
    ).rejects.toThrow('template name is required');
  });

  it('propagates load errors', async () => {
    const runner: TemplateRunner = {
      loadTemplate: jest.fn().mockRejectedValue(new Error('missing template')),
      renderTemplate: jest.fn(),
      runSteps: jest.fn(),
    };

    await expect(
      runTemplateTask({ template: 'deploy', params: {}, runner }),
    ).rejects.toThrow('missing template');
  });

  it('validates rendered steps', async () => {
    const runner: TemplateRunner = {
      loadTemplate: jest.fn().mockResolvedValue(templateSpec),
      renderTemplate: jest.fn().mockResolvedValue({ ...templateSpec, steps: [] }),
      runSteps: jest.fn(),
    };

    await expect(
      runTemplateTask({ template: 'deploy', params: {}, runner }),
    ).rejects.toThrow('Template "deploy" produced no steps');
  });

  it('rejects rendered templates without steps array', async () => {
    const runner: TemplateRunner = {
      loadTemplate: jest.fn().mockResolvedValue(templateSpec),
      renderTemplate: jest.fn().mockResolvedValue({ ...templateSpec, steps: undefined }),
      runSteps: jest.fn(),
    };

    await expect(runTemplateTask({ template: 'deploy', runner })).rejects.toThrow(
      'Template "deploy" produced no steps',
    );
  });

  it('defaults goal when not provided', async () => {
    const runner: TemplateRunner = {
      loadTemplate: jest.fn().mockResolvedValue({ ...templateSpec, name: 'deploy_gvpie' }),
      renderTemplate: jest.fn().mockResolvedValue(renderedSpec),
      runSteps: jest.fn().mockResolvedValue({ taskId: 'task-456' }),
    };

    await runTemplateTask({ template: 'deploy', params: {}, runner });

    expect(runner.runSteps).toHaveBeenCalledWith(renderedSpec.steps, {
      goal: 'deploy_gvpie',
      template: 'deploy',
      params: {},
    });
  });

  it('prefers explicit goal from metadata', async () => {
    const runner: TemplateRunner = {
      loadTemplate: jest.fn().mockResolvedValue(templateSpec),
      renderTemplate: jest.fn().mockResolvedValue(renderedSpec),
      runSteps: jest.fn().mockResolvedValue({ taskId: 'task-789' }),
    };

    await runTemplateTask({
      template: 'deploy',
      params: { project: 'gvpie', env: 'prod' },
      metadata: { goal: 'Deploy production' },
      runner,
    });

    expect(runner.runSteps).toHaveBeenLastCalledWith(renderedSpec.steps, {
      goal: 'Deploy production',
      template: 'deploy',
      params: { project: 'gvpie', env: 'prod' },
    });
  });

  it('uses empty params object when omitted', async () => {
    const runner: TemplateRunner = {
      loadTemplate: jest.fn().mockResolvedValue(templateSpec),
      renderTemplate: jest.fn().mockResolvedValue(renderedSpec),
      runSteps: jest.fn().mockResolvedValue({ taskId: 'task-900' }),
    };

    await runTemplateTask({ template: 'deploy', runner });

    expect(runner.runSteps).toHaveBeenLastCalledWith(renderedSpec.steps, {
      goal: templateSpec.name!,
      template: 'deploy',
      params: {},
    });
  });

  it('falls back to rendered name when spec lacks one', async () => {
    const runner: TemplateRunner = {
      loadTemplate: jest.fn().mockResolvedValue({ ...templateSpec, name: undefined }),
      renderTemplate: jest.fn().mockResolvedValue({ ...renderedSpec, name: 'rendered_goal' }),
      runSteps: jest.fn().mockResolvedValue({ taskId: 'task-901' }),
    };

    await runTemplateTask({ template: 'deploy', params: {}, runner });

    expect(runner.runSteps).toHaveBeenLastCalledWith(renderedSpec.steps, {
      goal: 'rendered_goal',
      template: 'deploy',
      params: {},
    });
  });

  it('falls back to template name when no goal metadata present', async () => {
    const runner: TemplateRunner = {
      loadTemplate: jest.fn().mockResolvedValue({ ...templateSpec, name: undefined }),
      renderTemplate: jest.fn().mockResolvedValue({ steps: renderedSpec.steps } as TemplateSpec),
      runSteps: jest.fn().mockResolvedValue({ taskId: 'task-902' }),
    };

    await runTemplateTask({ template: 'deploy', params: {}, runner });

    expect(runner.runSteps).toHaveBeenLastCalledWith(renderedSpec.steps, {
      goal: 'deploy',
      template: 'deploy',
      params: {},
    });
  });
});

function createNoopRunner(): TemplateRunner {
  return {
    loadTemplate: jest.fn(),
    renderTemplate: jest.fn(),
    runSteps: jest.fn(),
  };
}
