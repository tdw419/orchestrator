export interface TemplateStep {
    action: string;
    [key: string]: unknown;
}
export interface TemplateSpec {
    version?: number;
    name?: string;
    description?: string;
    params?: string[];
    steps: TemplateStep[];
    [key: string]: unknown;
}
export interface LoadTemplateOptions {
    baseDir?: string;
}
export declare class TemplateError extends Error {
    constructor(message: string);
}
export declare function loadTemplate(name: string, options?: LoadTemplateOptions): Promise<TemplateSpec>;
export declare function renderTemplate(spec: TemplateSpec, params?: Record<string, unknown>): TemplateSpec;
export declare function loadAndRenderTemplate(name: string, params?: Record<string, unknown>, options?: LoadTemplateOptions): Promise<TemplateSpec>;
