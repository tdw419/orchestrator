import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  TaskManager,
  DiagnosticsProvider,
  StepFailureContext,
} from '../../src/tasks/manager';

describe('TaskManager diagnostics hook', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'task-manager-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const createContext = (overrides: Partial<StepFailureContext> = {}): StepFailureContext => ({
    taskId: 'task-1',
    stepId: 'step-1',
    taskDir: tmpDir,
    cwd: tmpDir,
    ...overrides,
  });

  it('returns early when no diagnostics providers configured', async () => {
    const manager = new TaskManager();
    await manager.handleStepFailure(createContext());

    await expect(fs.access(path.join(tmpDir, 'diagnostics'))).rejects.toBeTruthy();
  });

  it('runs matching diagnostics providers and writes reports', async () => {
    const provider: DiagnosticsProvider = {
      name: 'stub',
      shouldRun: jest.fn().mockResolvedValue(true),
      run: jest.fn().mockResolvedValue({ ok: true, detail: 'checked' }),
    };

    const debug = jest.fn();
    const manager = new TaskManager({ diagnosticsProviders: [provider], logger: { debug } });

    await manager.handleStepFailure(createContext());

    expect(provider.shouldRun).toHaveBeenCalled();
    expect(provider.run).toHaveBeenCalled();
    expect(debug).toHaveBeenCalled();

    const reportsDir = path.join(tmpDir, 'diagnostics');
    const files = await fs.readdir(reportsDir);
    expect(files).toHaveLength(1);

    const reportContent = JSON.parse(await fs.readFile(path.join(reportsDir, files[0]), 'utf8'));
    expect(reportContent).toEqual({ ok: true, detail: 'checked' });
  });

  it('skips providers that opt out via shouldRun', async () => {
    const provider: DiagnosticsProvider = {
      name: 'skip',
      shouldRun: jest.fn().mockResolvedValue(false),
      run: jest.fn(),
    };

    const manager = new TaskManager({ diagnosticsProviders: [provider] });

    await manager.handleStepFailure(createContext());

    expect(provider.shouldRun).toHaveBeenCalled();
    expect(provider.run).not.toHaveBeenCalled();

    const reportsDir = path.join(tmpDir, 'diagnostics');
    const exists = await fileExists(reportsDir);
    if (exists) {
      const files = await fs.readdir(reportsDir);
      expect(files).toHaveLength(0);
    }
  });

  it('continues executing remaining providers even if one throws', async () => {
    const failing: DiagnosticsProvider = {
      name: 'fail',
      shouldRun: jest.fn().mockResolvedValue(true),
      run: jest.fn().mockRejectedValue(new Error('boom')),
    };

    const succeeding: DiagnosticsProvider = {
      name: 'ok',
      shouldRun: jest.fn().mockResolvedValue(true),
      run: jest.fn().mockResolvedValue({ ok: true }),
    };

    const warn = jest.fn();
    const manager = new TaskManager({ diagnosticsProviders: [failing, succeeding], logger: { warn } });

    await manager.handleStepFailure(createContext());

    expect(failing.run).toHaveBeenCalled();
    expect(succeeding.run).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();

    const reportsDir = path.join(tmpDir, 'diagnostics');
    const files = await fs.readdir(reportsDir);
    expect(files).toHaveLength(1);
  });
});

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch (error) {
    return false;
  }
}
