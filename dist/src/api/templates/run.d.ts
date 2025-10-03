import { TemplateSpec } from '../../tasks/templates';
export interface TemplateRunMetadata {
    goal: string;
    template: string;
    params: Record<string, unknown>;
}
export interface TemplateRunner {
    loadTemplate: (name: string) => Promise<TemplateSpec>;
    renderTemplate: (spec: TemplateSpec, params: Record<string, unknown>) => Promise<TemplateSpec> | TemplateSpec;
    runSteps: (steps: TemplateSpec['steps'], metadata: TemplateRunMetadata) => Promise<Record<string, unknown>>;
}
export interface RunTemplateTaskOptions {
    template: string;
    params?: Record<string, unknown>;
    metadata?: {
        goal?: string;
    };
    runner: TemplateRunner;
}
export declare function runTemplateTask(options: RunTemplateTaskOptions): Promise<Record<string, unknown>>;
