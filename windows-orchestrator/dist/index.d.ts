#!/usr/bin/env node
import type { Task, OrchestratorConfig, GlobalLearning } from './types.js';
declare const config: OrchestratorConfig;
declare const tasks: Record<string, Task>;
declare const globalLearning: GlobalLearning;
declare function log(...args: any[]): void;
export { config, tasks, globalLearning, log };
//# sourceMappingURL=index.d.ts.map