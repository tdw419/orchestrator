// Core orchestrator types with recursive testing capabilities

export type TaskStatus = 'queued' | 'running' | 'done' | 'error' | 'stopped';

export type ActionType = 
  | 'screenshot' | 'move_mouse' | 'click_mouse' | 'scroll' 
  | 'type_text' | 'key_press' | 'open_app' | 'run_powershell'
  | 'autodev_run' | 'verify_result' | 'spawn_subtask' 
  | 'spawn_template' | 'done';

export type VerificationMethod = 
  | 'file_exists' | 'api_call' | 'test' 
  | 'extension_command' | 'vscode_test';

export type ErrorType = 
  | 'timeout' | 'permission' | 'network' | 'resource' 
  | 'syntax' | 'missing_dependency' | 'server_error' 
  | 'client_error' | 'nonzero_exit' | 'error_flag' | 'unknown';

export type RetryStrategy = 
  | 'wait_longer' | 'escalate_privileges' | 'retry_connection' 
  | 'reduce_load' | 'fix_syntax' | 'install_dependency' | 'debug_approach';

export interface PlannedAction {
  thought: string;
  action: ActionType;
  params: Record<string, any>;
}

export interface ActionResult {
  status: number;
  data: Record<string, any>;
}

export interface AttemptInfo {
  n: number;
  action: PlannedAction;
  result: ActionResult;
}

export interface StepContext {
  learned_issues: string[];
  attempted_fixes: Array<{
    n: number;
    strategy: RetryStrategy;
    action: PlannedAction;
  }>;
}

export interface TaskStep {
  i: number;
  planned: PlannedAction;
  attempts: AttemptInfo[];
  context: StepContext;
  result?: any;
  screenshot?: string;
}

export interface HistoryEntry {
  role: 'user' | 'system' | 'assistant' | 'planner';
  content: string;
}

export interface Task {
  id: string;
  goal: string;
  status: TaskStatus;
  createdAt: string;
  history: HistoryEntry[];
  steps: TaskStep[];
  parentId?: string;
  depth?: number;
  error?: string;
}

export interface VerificationParams {
  check_method: VerificationMethod;
  path?: string;
  url?: string;
  method?: string;
  expected_status?: number;
  script?: string;
  command?: string;
  timeout?: number;
  extension_path?: string;
  test_type?: 'compile' | 'install' | 'command';
  expectation?: string;
}

export interface SubtaskParams {
  goal: string;
}

export interface TemplateParams {
  template: string;
  inputs?: Record<string, any>;
}

export interface GlobalLearning {
  errorPatterns: Map<string, {
    fixes: PlannedAction[];
    success_rate: number;
  }>;
  successfulFixes: Map<string, PlannedAction>;
}

export interface OrchestratorConfig {
  port: number;
  adminToken: string;
  apiBase: string;
  apiKey: string;
  model: string;
  desktopDriverUrl: string;
  maxSteps: number;
  maxRetriesPerStep: number;
  maxRecursionDepth: number;
  autodevRoot: string;
  pythonBin: string;
  maxContextChars: number;
  enableSummary: boolean;
  minSummaryIntervalMs: number;
  baseBackoffMs: number;
}

export interface DesktopDriverResponse {
  status: number;
  data: any;
}

export interface LLMResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// Template-specific types
export interface VSCodeTestInputs {
  extension_path?: string;
  commands?: string[];
}

export interface BuildTestFixInputs {
  project_dir?: string;
  test_command?: string;
}

export interface ValidateAndFixInputs {
  target?: string;
}

export type TemplateInputs = VSCodeTestInputs | BuildTestFixInputs | ValidateAndFixInputs;