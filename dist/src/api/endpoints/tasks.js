"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskRequestError = void 0;
exports.resolveTaskRequest = resolveTaskRequest;
const templates_1 = require("../../tasks/templates");
class TaskRequestError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TaskRequestError';
    }
}
exports.TaskRequestError = TaskRequestError;
async function resolveTaskRequest(payload, options = {}) {
    if (!payload || typeof payload !== 'object') {
        throw new TaskRequestError('Invalid task payload');
    }
    const env = payload.env && Object.keys(payload.env).length > 0 ? { ...payload.env } : undefined;
    if (payload.template) {
        const loader = options.loadTemplate ?? templates_1.loadTemplate;
        const renderer = options.renderTemplate ?? templates_1.renderTemplate;
        const spec = await loader(payload.template, options.loadOptions);
        const rendered = renderer(spec, payload.params ?? {});
        if (!Array.isArray(rendered.steps) || rendered.steps.length === 0) {
            throw new TaskRequestError(`Template "${payload.template}" did not produce any steps`);
        }
        const goal = payload.goal ?? rendered.name ?? payload.template;
        return {
            goal,
            steps: normalizeSteps(rendered.steps),
            env,
            template: {
                name: payload.template,
                params: { ...(payload.params ?? {}) },
            },
        };
    }
    if (!payload.steps || !Array.isArray(payload.steps) || payload.steps.length === 0) {
        throw new TaskRequestError('Task requires either a template or a non-empty steps array');
    }
    if (!payload.goal) {
        throw new TaskRequestError('Task goal is required when steps are provided directly');
    }
    return {
        goal: payload.goal,
        steps: normalizeSteps(payload.steps),
        env,
    };
}
function normalizeSteps(steps) {
    return steps.map(step => ({ ...step }));
}
//# sourceMappingURL=tasks.js.map