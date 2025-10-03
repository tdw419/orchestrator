export interface RoadmapItem {
    id: string;
    title: string;
    phase: number;
    priority?: number;
    complexity?: string;
    prompt: string;
}
export interface ConvertRoadmapOptions {
    roadmapPath?: string;
    specsDir?: string;
    tasksOutput?: string;
    timestamp?: string;
    include?: string[];
    exclude?: string[];
}
export interface RoadmapConverterDependencies {
    readJson: (file: string) => Promise<unknown>;
    ensureDir: (dir: string) => Promise<void>;
    writeFile: (file: string, contents: string) => Promise<void>;
}
export declare function convertRoadmapToSpecKit(options?: ConvertRoadmapOptions, deps?: Partial<RoadmapConverterDependencies>): Promise<void>;
