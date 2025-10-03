"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTemplateTask = runTemplateTask;
async function runTemplateTask(options) {
    const templateName = (options.template ?? '').trim();
    if (!templateName) {
        throw new Error('template name is required');
    }
    const params = options.params ?? {};
    const spec = await options.runner.loadTemplate(templateName);
    const rendered = await options.runner.renderTemplate(spec, params);
    const steps = Array.isArray(rendered?.steps) ? rendered.steps : undefined;
    if (!steps || steps.length === 0) {
        throw new Error(`Template "${templateName}" produced no steps`);
    }
    const goal = options.metadata?.goal ?? spec.name ?? rendered.name ?? templateName;
    const runMetadata = {
        goal,
        template: templateName,
        params,
    };
    return options.runner.runSteps(steps, runMetadata);
}
//# sourceMappingURL=run.js.map