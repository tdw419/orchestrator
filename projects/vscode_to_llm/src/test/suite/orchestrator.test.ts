import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { LMStudioMockServer } from '../../../tests/mocks/lmstudio-server';
import { OrchestratorClient } from '../../orchestratorClient';

suite('Orchestrator Extension Tests', () => {
  const mockServer = new LMStudioMockServer({ port: 4321 });
  let client: OrchestratorClient;
  let outputChannel: vscode.OutputChannel;

  suiteSetup(async () => {
    // Start mock server
    await mockServer.start();

    // Configure extension
    await vscode.workspace.getConfiguration().update('orchestrator.apiUrl', 'http://localhost:4321', true);
    await vscode.workspace.getConfiguration().update('orchestrator.timeoutMs', 5000, true);

    // Initialize client
    client = new OrchestratorClient({
      baseUrl: 'http://localhost:4321',
      timeoutMs: 5000
    });

    // Get output channel
    outputChannel = vscode.window.createOutputChannel('Orchestrator');
  });

  suiteTeardown(async () => {
    // Cleanup
    await mockServer.stop();
    outputChannel.dispose();
  });

  test('Command: convertRoadmap', async () => {
    // Create test roadmap
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, 'No workspace folder found');

    const roadmapPath = path.join(workspaceFolder.uri.fsPath, 'test-roadmap.json');
    const roadmapContent = JSON.stringify([
      {
        id: 'test-item',
        title: 'Test Item',
        phase: 1,
        prompt: 'Test prompt'
      }
    ]);

    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(roadmapPath),
      Buffer.from(roadmapContent)
    );

    // Run command
    await vscode.commands.executeCommand('orchestrator.convertRoadmap');

    // Verify output
    const specsDir = path.join(workspaceFolder.uri.fsPath, 'specs', 'roadmap');
    const tasksFile = path.join(specsDir, 'tasks.generated.md');
    const content = await vscode.workspace.fs.readFile(vscode.Uri.file(tasksFile));

    assert.ok(content.toString().includes('Test Item'), 'Generated tasks file missing content');
  });

  test('Command: browseTemplates', async () => {
    // Mock quick pick selection
    const mockPick = {
      label: 'lmstudio_reasoning',
      description: 'Test template',
      template: {
        name: 'lmstudio_reasoning',
        params: ['requirements']
      }
    };

    // Mock input box value
    const mockInput = 'Test requirements';

    // Override UI
    const quickPick = vscode.window.createQuickPick();
    quickPick.items = [mockPick];
    quickPick.onDidChangeSelection(([item]) => {
      if (item) {
        vscode.window.showInputBox = async () => mockInput;
      }
    });

    // Run command
    await vscode.commands.executeCommand('orchestrator.browseTemplates');

    // Verify output channel
    const output = outputChannel.value;
    assert.ok(output.includes('Running template'), 'Output missing execution status');
    assert.ok(output.includes('completed successfully'), 'Output missing completion status');
  });

  test('Command: runSpecKitPhase', async () => {
    // Mock input values
    const mockPhase = 'Phase 1: Test';
    const mockInclude = 'T001,T002';
    const mockExclude = 'T003';

    // Override input boxes
    let inputCount = 0;
    vscode.window.showInputBox = async () => {
      inputCount++;
      switch (inputCount) {
        case 1: return mockPhase;
        case 2: return mockInclude;
        case 3: return mockExclude;
        default: return undefined;
      }
    };

    // Run command
    await vscode.commands.executeCommand('orchestrator.runSpecKitPhase');

    // Verify output channel
    const output = outputChannel.value;
    assert.ok(output.includes('Running SpecKit automation'), 'Output missing execution status');
    assert.ok(output.includes('completed'), 'Output missing completion status');
  });

  test('Client: handles SSE retry', async () => {
    // Test stream interruption
    let disconnectCount = 0;
    const handler = {
      onStatus: (status: string) => {
        if (disconnectCount === 0) {
          disconnectCount++;
          mockServer.stop();
          setTimeout(() => mockServer.start(), 1000);
        }
      }
    };

    try {
      await client.runTemplate('test', { requirements: 'test' }, handler);
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes('connection'), 'Error should indicate connection issue');
    }

    // Verify retry
    const status = await client.getHealth();
    assert.ok(status.ok, 'Server should be back up after retry');
  });

  test('Client: supports cancellation', async () => {
    const abortController = new AbortController();

    // Start long-running template
    const templatePromise = client.runTemplate(
      'long_running',
      { duration: '10s' },
      {
        onStatus: () => {},
        signal: abortController.signal
      }
    );

    // Cancel after 1s
    setTimeout(() => abortController.abort(), 1000);

    try {
      await templatePromise;
      assert.fail('Should have been cancelled');
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.ok(error.name === 'AbortError', 'Error should be AbortError');
    }
  });
});