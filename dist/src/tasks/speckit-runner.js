"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSpecKitAutomation = runSpecKitAutomation;
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = require("node:fs");
const DEFAULT_TASKS_FILE = node_path_1.default.join('specs', '001-core-task-system', 'tasks.md');
const DEFAULT_TEMPLATES_DIR = 'templates';
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function normalizeUrl(base) {
    return base.endsWith('/') ? base.slice(0, -1) : base;
}
function parseTasksForPhase(markdown, phaseHeading) {
    const lines = markdown.split(/\r?\n/);
    const headingRegex = new RegExp(`^##\\s+${escapeRegExp(phaseHeading)}\\s*$`, 'i');
    const startIndex = lines.findIndex(line => headingRegex.test(line.trim()));
    if (startIndex === -1) {
        throw new Error(`Phase "${phaseHeading}" not found in tasks file`);
    }
    const tasks = [];
    for (let i = startIndex + 1; i < lines.length; i += 1) {
        const line = lines[i];
        if (/^##\s+/.test(line)) {
            break;
        }
        const match = /^- \[.\]\s+(T\d{3})\s+(?:\[P\]\s+)?(.+)$/.exec(line.trim());
        if (match) {
            const [, id, description] = match;
            const parallel = line.includes('[P]');
            tasks.push({ id, description: description.trim(), parallel });
        }
    }
    return tasks;
}
function buildTemplateMap(templateFiles) {
    const mapping = {};
    for (const file of templateFiles) {
        const parsed = node_path_1.default.parse(file);
        if (!parsed.ext || !/\.ya?ml$/i.test(parsed.ext)) {
            continue;
        }
        const match = /^speckit_(T\d{3})_/.exec(parsed.name);
        if (match) {
            const [, taskId] = match;
            mapping[taskId.toUpperCase()] = parsed.name;
        }
    }
    return mapping;
}
const defaultDependencies = {
    readFile: file => node_fs_1.promises.readFile(file, 'utf8'),
    readDir: dir => node_fs_1.promises.readdir(dir),
    fetch: (url, init) => {
        const fetchImpl = globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            throw new Error('Global fetch is not available in this environment');
        }
        return fetchImpl(url, init);
    },
};
async function runSpecKitAutomation(options, deps) {
    const dependencies = {
        readFile: deps?.readFile ?? defaultDependencies.readFile,
        readDir: deps?.readDir ?? defaultDependencies.readDir,
        fetch: deps?.fetch ?? defaultDependencies.fetch,
    };
    const tasksFile = options.tasksFile ?? DEFAULT_TASKS_FILE;
    const templatesDir = options.templatesDir ?? DEFAULT_TEMPLATES_DIR;
    const includeSet = new Set((options.include ?? []).map(id => id.toUpperCase()));
    const excludeSet = new Set((options.exclude ?? []).map(id => id.toUpperCase()));
    const markdown = await dependencies.readFile(tasksFile);
    const tasks = parseTasksForPhase(markdown, options.phase);
    const filteredTasks = tasks.filter(task => {
        const id = task.id.toUpperCase();
        if (includeSet.size > 0 && !includeSet.has(id)) {
            return false;
        }
        if (excludeSet.has(id)) {
            return false;
        }
        return true;
    });
    const templateFiles = await dependencies.readDir(templatesDir);
    const templateMap = buildTemplateMap(templateFiles);
    const orchestratorUrl = normalizeUrl(options.orchestratorUrl);
    const submitted = [];
    for (const task of filteredTasks) {
        const templateName = templateMap[task.id.toUpperCase()];
        if (!templateName) {
            throw new Error(`No template registered for task ${task.id}`);
        }
        const body = {
            template: templateName,
            params: options.templateParams?.[task.id] ?? {},
            metadata: {
                specKitTask: task.id,
                description: task.description,
            },
        };
        const response = await dependencies.fetch(`${orchestratorUrl}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            throw new Error(`Failed to enqueue task ${task.id}: ${response.status} ${response.statusText ?? ''}`.trim());
        }
        submitted.push({ id: task.id, template: templateName });
    }
    return {
        submitted: submitted.length,
        tasks: submitted,
    };
}
//# sourceMappingURL=speckit-runner.js.map