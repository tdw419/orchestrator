"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskManager = void 0;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const DEFAULT_DIAGNOSTICS_DIR = 'diagnostics';
class TaskManager {
    constructor(options = {}) {
        this.diagnosticsProviders = options.diagnosticsProviders ?? [];
        this.diagnosticsDirName = options.diagnosticsDirName ?? DEFAULT_DIAGNOSTICS_DIR;
        this.logger = options.logger ?? {};
    }
    async handleStepFailure(context) {
        if (this.diagnosticsProviders.length === 0) {
            return;
        }
        const diagnosticsDir = node_path_1.default.join(context.taskDir, this.diagnosticsDirName);
        await promises_1.default.mkdir(diagnosticsDir, { recursive: true });
        for (const provider of this.diagnosticsProviders) {
            try {
                const shouldRun = await provider.shouldRun(context);
                if (!shouldRun) {
                    continue;
                }
                const report = await provider.run(context);
                const fileName = `${context.stepId}-${provider.name}.json`;
                const filePath = node_path_1.default.join(diagnosticsDir, fileName);
                await promises_1.default.writeFile(filePath, JSON.stringify(report, null, 2), 'utf8');
                this.logger.debug?.('Diagnostics provider completed', {
                    provider: provider.name,
                    taskId: context.taskId,
                    stepId: context.stepId,
                    file: filePath,
                });
            }
            catch (error) {
                this.logger.warn?.('Diagnostics provider failed', {
                    provider: provider.name,
                    taskId: context.taskId,
                    stepId: context.stepId,
                    error: error instanceof Error ? error.message : error,
                });
            }
        }
    }
}
exports.TaskManager = TaskManager;
//# sourceMappingURL=manager.js.map