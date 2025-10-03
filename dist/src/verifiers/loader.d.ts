export interface VerifierContext {
    taskId: string;
    [key: string]: unknown;
}
export type VerifierResult = Record<string, unknown> & {
    ok: boolean;
};
export type VerifierFunction = (args: Record<string, unknown>, context: VerifierContext) => unknown;
export interface LoadVerifierOptions {
    baseDirs?: string[];
    requireFn?: (modulePath: string) => Record<string, unknown>;
    importFn?: (modulePath: string) => Promise<Record<string, unknown>>;
}
export declare class VerifierLoaderError extends Error {
    constructor(message: string);
}
export declare function loadVerifier(identifier: string, options?: LoadVerifierOptions): Promise<VerifierFunction>;
