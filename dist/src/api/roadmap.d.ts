import { Request, Response } from 'express';
export interface ConvertRoadmapRequest {
    roadmapFile: string;
    outputDir: string;
    tasksFile: string;
    phase?: number;
    include?: string[];
    exclude?: string[];
}
export declare function convertRoadmapHandler(req: Request, res: Response): Promise<void>;
