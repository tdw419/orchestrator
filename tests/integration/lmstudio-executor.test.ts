import path from 'node:path';
import { LMStudioMockServer } from '../mocks/lmstudio-server';
import { LMStudioExecutor } from '../../src/executors/lmstudio';
import { LMStudioProvider } from '../../src/providers/lmstudio';

describe('LM Studio Executor Integration', () => {
  let mockServer: LMStudioMockServer;
  let provider: LMStudioProvider;
  let executor: LMStudioExecutor;
  let statusUpdates: string[];

  beforeAll(async () => {
    mockServer = new LMStudioMockServer({ port: 4321 });
    await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  beforeEach(() => {
    statusUpdates = [];
    provider = new LMStudioProvider({
      apiBase: mockServer.url,
      apiKey: 'test-key',
      model: 'mock-model'
    });
    executor = new LMStudioExecutor({
      taskId: 'test-task',
      cwd: process.cwd(),
      provider,
      onStatus: (status) => statusUpdates.push(status)
    });
  });

  it('executes reasoning steps with streaming updates', async () => {
    const step = {
      id: 'analyze',
      type: 'reason',
      prompt: 'Analyze this feature request',
      context: 'You are helping plan implementation details'
    };

    const result = await executor.executeStep(step);
    expect(result.success).toBe(true);
    expect(result.output).toBeTruthy();
    expect(statusUpdates.length).toBeGreaterThan(1);
    expect(statusUpdates[0]).toContain('Executing step analyze');
  });

  it('handles command steps', async () => {
    const step = {
      id: 'build',
      type: 'command',
      command: 'npm run build'
    };

    const result = await executor.executeStep(step);
    expect(result.success).toBe(true);
    expect(result.output).toContain('npm run build');
  });

  it('handles errors and notifies task manager', async () => {
    const errorStep = {
      id: 'error',
      type: 'reason',
      prompt: 'trigger error'
    };

    const result = await executor.executeStep(errorStep);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('processes template with multiple reasoning steps', async () => {
    const templatePath = path.join(__dirname, '../../templates/lmstudio_reasoning.yaml');
    const yamlContent = await import('fs').then(fs => fs.promises.readFile(templatePath, 'utf8'));
    const template = await import('yaml').then(yaml => yaml.parse(yamlContent));

    for (const step of template.steps) {
      const result = await executor.executeStep({
        ...step,
        prompt: step.prompt.replace('${requirements}', 'Add dark mode support')
      });
      expect(result.success).toBe(true);
    }

    expect(executor.stats.totalRequests).toBe(template.steps.length);
  });
});