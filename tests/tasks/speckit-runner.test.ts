import { runSpecKitAutomation } from '../../src/tasks/speckit-runner';

describe('runSpecKitAutomation', () => {
  const tasksMarkdown = `# Tasks

## Phase 11: Template Runtime & Automation
- [ ] T055 [P] Template catalog endpoint tests in tests/api/templates/catalog.test.ts
- [ ] T056 Template catalog endpoint implementation in src/api/templates/catalog.ts
- [ ] T057 [P] Template execution endpoint tests in tests/api/templates/run.test.ts

## Phase 12: VSCode & Orchestrator Integration
- [ ] T063 [P] VSCode extension templating tests in projects/vscode_to_llm/tests/templates.test.ts
- [ ] T064 VSCode extension template integration in projects/vscode_to_llm/src/extension.ts
`;

  const templateFiles = [
    'speckit_T055_api_catalog_tests.yaml',
    'speckit_T056_api_catalog_impl.yaml',
    'speckit_T057_api_run_tests.yaml',
    'speckit_T056_extra.yml',
    'README.md',
  ];

  const orchestratorUrl = 'http://localhost:4100';

  const okResponse = (taskId: string) => ({
    ok: true,
    json: async () => ({ id: taskId }),
  });

  it('submits templates for a phase to the orchestrator', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(okResponse('task-1'))
      .mockResolvedValueOnce(okResponse('task-2'))
      .mockResolvedValueOnce(okResponse('task-3'));

    const result = await runSpecKitAutomation(
      {
        phase: 'Phase 11: Template Runtime & Automation',
        orchestratorUrl: `${orchestratorUrl}/`,
        tasksFile: '/tmp/tasks.md',
        templatesDir: '/tmp/templates',
      },
      {
        readFile: jest.fn().mockResolvedValue(tasksMarkdown),
        readDir: jest.fn().mockResolvedValue(templateFiles),
        fetch: fetchMock,
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://localhost:4100/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template: 'speckit_T055_api_catalog_tests',
        params: {},
        metadata: {
          specKitTask: 'T055',
          description: 'Template catalog endpoint tests in tests/api/templates/catalog.test.ts',
        },
      }),
    });

    expect(result.submitted).toBe(3);
    expect(result.tasks.map(task => task.id)).toEqual(['T055', 'T056', 'T057']);
  });

  it('filters tasks by include/exclude', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse('task-1'));

    await runSpecKitAutomation(
      {
        phase: 'Phase 11: Template Runtime & Automation',
        orchestratorUrl,
        include: ['T055'],
        exclude: ['T057'],
      },
      {
        readFile: jest.fn().mockResolvedValue(tasksMarkdown),
        readDir: jest.fn().mockResolvedValue(templateFiles),
        fetch: fetchMock,
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:4100/tasks');
    expect(JSON.parse((options as RequestInit).body as string).template).toBe('speckit_T055_api_catalog_tests');
  });

  it('throws when template is not found for task', async () => {
    await expect(
      runSpecKitAutomation(
        {
          phase: 'Phase 12: VSCode & Orchestrator Integration',
          orchestratorUrl,
          tasksFile: '/tmp/tasks.md',
          templatesDir: '/tmp/templates',
        },
        {
          readFile: jest.fn().mockResolvedValue(tasksMarkdown),
          readDir: jest.fn().mockResolvedValue(templateFiles),
          fetch: jest.fn(),
        },
      ),
    ).rejects.toThrow(/No template registered for task T063/);
  });

  it('bubbles up orchestrator errors', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'error' });

    await expect(
      runSpecKitAutomation(
        {
          phase: 'Phase 11: Template Runtime & Automation',
          orchestratorUrl,
        },
        {
          readFile: jest.fn().mockResolvedValue(tasksMarkdown),
          readDir: jest.fn().mockResolvedValue(templateFiles),
          fetch: fetchMock,
        },
      ),
    ).rejects.toThrow(/Failed to enqueue task T055/);
  });

  it('throws when requested phase is missing', async () => {
    await expect(
      runSpecKitAutomation(
        {
          phase: 'Phase 99: Unknown',
          orchestratorUrl,
        },
        {
          readFile: jest.fn().mockResolvedValue(tasksMarkdown),
          readDir: jest.fn().mockResolvedValue(templateFiles),
          fetch: jest.fn(),
        },
      ),
    ).rejects.toThrow(/Phase "Phase 99: Unknown" not found/);
  });

  it('uses global fetch when dependencies not provided', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    try {
      await runSpecKitAutomation({
        phase: 'Phase 11: Template Runtime & Automation',
        orchestratorUrl,
        tasksFile: '/tmp/tasks.md',
        templatesDir: '/tmp/templates',
        include: ['T055'],
      }, {
        readFile: jest.fn().mockResolvedValue(tasksMarkdown),
        readDir: jest.fn().mockResolvedValue(templateFiles),
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(fetchMock).toHaveBeenCalled();
  });
});
