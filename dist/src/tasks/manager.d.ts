export interface StepFailureContext {
    taskId: string;
    stepId: string;
    taskDir: string;
    cwd?: string;
    [key: string]: unknown;
}
export interface DiagnosticsProvider {
    name: string;
    shouldRun: (context: StepFailureContext) => boolean | Promise<boolean>;
    run: (context: StepFailureContext) => Promise<Record<string, unknown>>;
}
export interface TaskManagerLogger {
    debug?: (message: string, meta?: Record<string, unknown>) => void;
    warn?: (message: string, meta?: Record<string, unknown>) => void;
    error?: (message: string, meta?: Record<string, unknown>) => void;
}
export interface TaskManagerOptions {
    diagnosticsProviders?: DiagnosticsProvider[];
    diagnosticsDirName?: string;
    logger?: TaskManagerLogger;
}
export declare class TaskManager {
    private readonly diagnosticsProviders;
    private readonly diagnosticsDirName;
    private readonly logger;
    constructor(options?: TaskManagerOptions);
    handleStepFailure(context: StepFailureContext): Promise<void>;
}
