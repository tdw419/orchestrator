/**
 * Environment configuration
 */
export declare const config: {
    port: number;
    model: string;
    openaiApiBase: string;
    openaiApiKey: string | undefined;
    desktopDriverUrl: string;
    maxSteps: number;
    maxRetriesPerStep: number;
    maxRecursionDepth: number;
    baseBackoffMs: number;
    pythonBin: string;
    maxContextChars: number;
};
