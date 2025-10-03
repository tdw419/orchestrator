/**
 * Core type definitions for the orchestrator
 */
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed';
export interface Task {
    id: string;
    goal: string;
    status: TaskStatus;
    createdAt: string;
    env?: Record<string, string>;
    steps: Step[];
}
export interface Step {
    id: string;
    action: string;
    params: Record<string, unknown>;
    status: TaskStatus;
    output?: string;
    error?: string;
    retries: number;
}
export interface VerificationResult {
    success: boolean;
    reason?: string;
    details?: Record<string, unknown>;
}
export interface TaskEvent {
    taskId: string;
    type: 'step_start' | 'step_complete' | 'step_fail' | 'task_complete' | 'task_fail';
    data: Record<string, unknown>;
    timestamp: string;
}
