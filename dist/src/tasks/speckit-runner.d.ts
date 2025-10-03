export interface RunSpecKitAutomationOptions {
    phase: string;
    orchestratorUrl: string;
    tasksFile?: string;
    templatesDir?: string;
    include?: string[];
    exclude?: string[];
    templateParams?: Record<string, Record<string, unknown>>;
}
interface FetchInit {
    method: string;
    headers: Record<string, string>;
    body: string;
}
interface FetchResponse {
    ok: boolean;
    status: number;
    statusText?: string;
}
export interface RunSpecKitAutomationDependencies {
    readFile: (file: string) => Promise<string>;
    readDir: (dir: string) => Promise<string[]>;
    fetch: (url: string, init: FetchInit) => Promise<FetchResponse>;
}
export interface RunSpecKitAutomationResult {
    submitted: number;
    tasks: {
        id: string;
        template: string;
    }[];
}
export declare function runSpecKitAutomation(options: RunSpecKitAutomationOptions, deps?: Partial<RunSpecKitAutomationDependencies>): Promise<RunSpecKitAutomationResult>;
export {};
