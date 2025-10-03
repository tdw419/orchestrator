import { RunTemplateTaskOptions, TemplateRunner } from '../api/templates/run';
export interface CliIO {
    stdout: (message: string) => void;
    stderr: (message: string) => void;
    exit: (code: number) => void;
}
export interface CliDependencies {
    runTemplateTask: (options: RunTemplateTaskOptions) => Promise<Record<string, unknown>>;
    runner: TemplateRunner;
}
export declare function runTemplateCli(argv: string[], io?: CliIO, dependencies?: CliDependencies): Promise<void>;
