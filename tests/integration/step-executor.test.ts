import { EventEmitter } from 'events';
import { StepExecutor } from '../../src/tasks/step-executor';
import { LMStudioMockServer } from '../mocks/lmstudio-server';

describe('Step Executor Integration', () => {
  let mockServer: LMStudioMockServer;
  let executor: StepExecutor;
  let emitter: EventEmitter;
  let statusEvents: Array<{ taskId: string; status: string }>;

  beforeAll(async () => {
    mockServer = new LMStudioMockServer({ port: 4321 });
    await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  beforeEach(() => {
    statusEvents = [];
    emitter = new EventEmitter();
    emitter.on('status', (event) => statusEvents.push(event));

    executor = new StepExecutor({
      taskId: 'test-task',
      emitter
    });
  });

  it('executes reasoning steps with status updates', async () => {
    const step = {
      id: 'reason',
      type: 'reason',
      prompt: 'Analyze requirements',
      context: 'You are a software architect'
    };

    const result = await executor.executeStep(step);
    expect(result.success).toBe(true);
    expect(result.output).toBeTruthy();

    expect(statusEvents.length).toBeGreaterThan(1);
    expect(statusEvents[0].status).toContain('Executing step reason');
    expect(statusEvents[statusEvents.length - 1].status).toContain('Reasoning:');
  });

  it('executes command steps', async () => {
    const step = {
      id: 'command',
      type: 'command',
      command: 'npm test'
    };

    const result = await executor.executeStep(step);
    expect(result.success).toBe(true);
    expect(result.output).toContain('npm test');

    expect(statusEvents.length).toBe(1);
    expect(statusEvents[0].status).toContain('Executing step command');
  });

  it('handles unknown step types', async () => {
    const step = {
      id: 'unknown',
      type: 'invalid'
    };

    const result = await executor.executeStep(step);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown step type');
  });

  it('processes template with mixed steps', async () => {
    const steps = [
      {
        id: 'analyze',
        type: 'reason',
        prompt: 'Plan implementation'
      },
      {
        id: 'build',
        type: 'command',
        command: 'npm run build'
      },
      {
        id: 'validate',
        type: 'reason',
        prompt: 'Validate changes'
      }
    ];

    for (const step of steps) {
      const result = await executor.executeStep(step);
      expect(result.success).toBe(true);
    }

    expect(statusEvents.length).toBeGreaterThan(steps.length);
    expect(executor.stats.totalRequests).toBe(2); // Two reasoning steps
  });
});