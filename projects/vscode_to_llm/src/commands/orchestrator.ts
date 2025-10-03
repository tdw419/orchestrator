import * as vscode from 'vscode';
import { OrchestratorClient } from '../orchestratorClient';

export class OrchestratorCommands {
  private readonly client: OrchestratorClient;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly statusBar: vscode.StatusBarItem;
  private currentAbortController?: AbortController;
  private readonly cancelButton: vscode.StatusBarItem;

  constructor() {
    const config = vscode.workspace.getConfiguration('orchestrator');
    this.client = new OrchestratorClient({
      baseUrl: config.get('apiUrl') || 'http://localhost:4100'
    });

    this.outputChannel = vscode.window.createOutputChannel('Orchestrator');
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);

    this.cancelButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    this.cancelButton.text = '$(x) Cancel';
    this.cancelButton.command = 'orchestrator.cancelOperation';
  }

  async convertRoadmap() {
    try {
      // Get workspace folder
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder found');
      }

      // Get roadmap file
      const roadmapFile = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        defaultUri: workspaceFolder.uri,
        filters: {
          'Roadmap': ['json', 'md']
        },
        title: 'Select Roadmap File'
      });

      if (!roadmapFile?.[0]) {
        return;
      }

      // Configure output
      const specsDir = vscode.Uri.joinPath(workspaceFolder.uri, 'specs', 'roadmap');
      const tasksFile = vscode.Uri.joinPath(specsDir, 'tasks.generated.md');

      // Convert roadmap
      const result = await this.client.convertRoadmap(
        roadmapFile[0].fsPath,
        specsDir.fsPath,
        tasksFile.fsPath
      );

      // Show output
      if (result.success) {
        const doc = await vscode.workspace.openTextDocument(tasksFile);
        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage('Roadmap converted successfully');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to convert roadmap: ${error}`);
    }
  }

  async browseTemplates() {
    try {
      const templates = await this.client.getTemplates();
      const items = templates.map(t => ({
        label: t.name,
        description: t.description || '',
        detail: `Parameters: ${t.params?.join(', ') || 'none'} | Types: ${t.stepTypes.join(', ')}`,
        template: t
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a template to run'
      });

      if (!selected) {
        return;
      }

      // Collect parameters
      const params: Record<string, unknown> = {};
      if (selected.template.params) {
        for (const param of selected.template.params) {
          const value = await vscode.window.showInputBox({
            prompt: `Enter value for ${param}`,
            placeHolder: param
          });
          if (value === undefined) {
            return;
          }
          params[param] = value;
        }
      }

      // Run template
      this.outputChannel.clear();
      this.outputChannel.show();
      this.statusBar.text = '$(sync~spin) Running template...';
      this.statusBar.show();

      await this.client.runTemplate(selected.template.name, params, this.createStreamHandler());
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to run template: ${error}`);
      this.statusBar.hide();
    }
  }

  async runSpecKitPhase() {
    try {
      const input = await vscode.window.showInputBox({
        prompt: 'Enter phase name (e.g. "Phase 1: Template Runtime")',
        placeHolder: 'Phase name'
      });

      if (!input) {
        return;
      }

      // Optional filters
      const include = await vscode.window.showInputBox({
        prompt: 'Enter task IDs to include (comma-separated, optional)',
        placeHolder: 'e.g. T001,T002'
      });

      const exclude = await vscode.window.showInputBox({
        prompt: 'Enter task IDs to exclude (comma-separated, optional)',
        placeHolder: 'e.g. T003,T004'
      });

      // Run automation
      this.outputChannel.clear();
      this.outputChannel.show();
      this.statusBar.text = '$(sync~spin) Running SpecKit automation...';
      this.statusBar.show();

      await this.client.runSpecKitAutomation(input, this.createStreamHandler(), {
        include: include?.split(',').map(s => s.trim()).filter(Boolean),
        exclude: exclude?.split(',').map(s => s.trim()).filter(Boolean)
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to run SpecKit automation: ${error}`);
      this.statusBar.hide();
    }
  }

  private startOperation() {
    // Reset any previous operation
    this.cancelOperation();

    // Start new operation
    this.currentAbortController = new AbortController();
    this.cancelButton.show();
  }

  private cancelOperation() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = undefined;
    }
    this.cancelButton.hide();
    this.statusBar.hide();
  }

  private createStreamHandler() {
    return {
      signal: this.currentAbortController?.signal,
      onStatus: (status: string) => {
        this.outputChannel.appendLine(status);
        this.statusBar.text = `$(sync~spin) ${status}`;
      },
      onWarning: (warning: string) => {
        this.outputChannel.appendLine(`⚠️ ${warning}`);
        vscode.window.showWarningMessage(warning);
      },
      onError: (error: string) => {
        this.outputChannel.appendLine(`❌ ${error}`);
        vscode.window.showErrorMessage(error);
        this.cancelOperation();
      },
      onComplete: (results: Record<string, unknown>) => {
        this.outputChannel.appendLine('\n✅ Operation completed successfully');
        this.outputChannel.appendLine(JSON.stringify(results, null, 2));
        vscode.window.showInformationMessage('Operation completed successfully');
        this.cancelOperation();
      },
      onRetry: (attempt: number, error: Error) => {
        const message = `Operation failed (attempt ${attempt}): ${error.message}. Retrying...`;
        this.outputChannel.appendLine(`⚠️ ${message}`);
        return true;
      }
    };
  }

  registerCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.commands.registerCommand('orchestrator.convertRoadmap', () => {
        this.startOperation();
        return this.convertRoadmap();
      }),
      vscode.commands.registerCommand('orchestrator.browseTemplates', () => {
        this.startOperation();
        return this.browseTemplates();
      }),
      vscode.commands.registerCommand('orchestrator.runSpecKitPhase', () => {
        this.startOperation();
        return this.runSpecKitPhase();
      }),
      vscode.commands.registerCommand('orchestrator.cancelOperation', () => {
        this.cancelOperation();
        this.outputChannel.appendLine('\n❌ Operation cancelled by user');
        vscode.window.showInformationMessage('Operation cancelled');
      }),
      this.outputChannel,
      this.statusBar,
      this.cancelButton
    );
  }
}