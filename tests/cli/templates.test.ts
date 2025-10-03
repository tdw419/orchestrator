import { runTemplateCli, CliIO } from '../../src/cli/templates';
import { TemplateRunner } from '../../src/api/templates/run';

describe('runTemplateCli', () => {
  const baseRunner: TemplateRunner = {
    loadTemplate: jest.fn(),
    renderTemplate: jest.fn(),
    runSteps: jest.fn(),
  };

  const createIO = () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    return {
      stdout: (msg: string) => stdout.push(msg),
      stderr: (msg: string) => stderr.push(msg),
      exit: jest.fn(),
      stdoutLines: stdout,
      stderrLines: stderr,
    };
  };

  const createDeps = () => ({
    runTemplateTask: jest.fn().mockResolvedValue({ taskId: 'task-1', status: 'queued' }),
    runner: { ...baseRunner },
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('executes template run and prints JSON result', async () => {
    const io = createIO();
    const deps = createDeps();

    await runTemplateCli(['node', 'cli', 'run', 'deploy', '--param', 'project=gvpie', '--goal', 'Deploy app'], io as unknown as CliIO, deps);

    expect(deps.runTemplateTask).toHaveBeenCalledWith({
      template: 'deploy',
      params: { project: 'gvpie' },
      metadata: { goal: 'Deploy app' },
      runner: deps.runner,
    });

    expect(io.stdoutLines.join('\n')).toContain('task-1');
    expect(io.stderrLines).toHaveLength(0);
    expect(io.exit).toHaveBeenCalledWith(0);
  });

  it('handles multiple params and defaults goal', async () => {
    const io = createIO();
    const deps = createDeps();

    await runTemplateCli(
      ['node', 'cli', 'run', 'build', '--param', 'project=gvpie', '--param', 'env=staging'],
      io as unknown as CliIO,
      deps,
    );

    expect(deps.runTemplateTask).toHaveBeenCalledWith({
      template: 'build',
      params: { project: 'gvpie', env: 'staging' },
      metadata: {},
      runner: deps.runner,
    });
    expect(io.exit).toHaveBeenCalledWith(0);
  });

  it('throws when command missing', async () => {
    const io = createIO();
    const deps = createDeps();

    await expect(runTemplateCli(['node', 'cli'], io as unknown as CliIO, deps)).rejects.toThrow('command');
  });

  it('throws when command is unsupported', async () => {
    const io = createIO();
    const deps = createDeps();

    await expect(runTemplateCli(['node', 'cli', 'list'], io as unknown as CliIO, deps)).rejects.toThrow('Unsupported command');
  });

  it('throws when template is missing for run command', async () => {
    const io = createIO();
    const deps = createDeps();

    await expect(runTemplateCli(['node', 'cli', 'run'], io as unknown as CliIO, deps)).rejects.toThrow('template name');
  });

  it('throws when param flag missing value', async () => {
    const io = createIO();
    const deps = createDeps();

    await expect(
      runTemplateCli(['node', 'cli', 'run', 'deploy', '--param'], io as unknown as CliIO, deps),
    ).rejects.toThrow('key=value');
  });

  it('throws when goal flag missing value', async () => {
    const io = createIO();
    const deps = createDeps();

    await expect(
      runTemplateCli(['node', 'cli', 'run', 'deploy', '--goal'], io as unknown as CliIO, deps),
    ).rejects.toThrow('--goal flag requires a value');
  });

  it('throws on unknown flag', async () => {
    const io = createIO();
    const deps = createDeps();

    await expect(
      runTemplateCli(['node', 'cli', 'run', 'deploy', '--unknown'], io as unknown as CliIO, deps),
    ).rejects.toThrow('Unknown flag');
  });

  it('writes error to stderr and exits non-zero when run fails', async () => {
    const io = createIO();
    const deps = createDeps();
    deps.runTemplateTask.mockRejectedValueOnce(new Error('boom'));

    await runTemplateCli(['node', 'cli', 'run', 'deploy'], io as unknown as CliIO, deps);

    expect(io.stderrLines.join('\n')).toContain('boom');
    expect(io.exit).toHaveBeenLastCalledWith(1);
  });
});
