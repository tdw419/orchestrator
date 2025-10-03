import { TemplateSpec, LoadTemplateOptions } from '../../tasks/templates';
export interface TaskStep {
    action: string;
    [key: string]: unknown;
}
export interface TaskRequestPayload {
    goal?: string;
    steps?: TaskStep[];
    template?: string;
    params?: Record<string, unknown>;
    env?: Record<string, string>;
}
export interface ResolvedTaskRequest {
    goal: string;
    steps: TaskStep[];
    env?: Record<string, string>;
    template?: {
        name: string;
        params: Record<string, unknown>;
    };
}
export interface ResolveTaskRequestOptions {
    loadTemplate?: (name: string, options?: LoadTemplateOptions) => Promise<TemplateSpec>;
    renderTemplate?: (spec: TemplateSpec, params?: Record<string, unknown>) => TemplateSpec;
    loadOptions?: LoadTemplateOptions;
}
export declare class TaskRequestError extends Error {
    constructor(message: string);
}
export declare function resolveTaskRequest(payload: TaskRequestPayload, options?: ResolveTaskRequestOptions): Promise<ResolvedTaskRequest>;
