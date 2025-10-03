"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateError = void 0;
exports.loadTemplate = loadTemplate;
exports.renderTemplate = renderTemplate;
exports.loadAndRenderTemplate = loadAndRenderTemplate;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_url_1 = require("node:url");
const yaml_1 = require("yaml");
class TemplateError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TemplateError';
    }
}
exports.TemplateError = TemplateError;
const DEFAULT_TEMPLATE_DIR = node_path_1.default.join(process.cwd(), 'templates');
const TEMPLATE_EXTENSIONS = ['.yaml', '.yml'];
async function loadTemplate(name, options = {}) {
    if (!name) {
        throw new TemplateError('Template name is required');
    }
    const baseDir = options.baseDir ?? DEFAULT_TEMPLATE_DIR;
    for (const ext of TEMPLATE_EXTENSIONS) {
        const filePath = node_path_1.default.join(baseDir, `${name}${ext}`);
        try {
            const content = await promises_1.default.readFile(filePath, 'utf8');
            return parseTemplate(content, filePath);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                continue;
            }
            throw new TemplateError(`Failed to load template "${name}": ${error.message}`);
        }
    }
    throw new TemplateError(`Template "${name}" not found in ${(0, node_url_1.pathToFileURL)(baseDir).toString()}`);
}
function parseTemplate(content, source) {
    let raw;
    try {
        raw = (0, yaml_1.parse)(content);
    }
    catch (error) {
        throw new TemplateError(`Template ${source} contains invalid YAML: ${error.message}`);
    }
    if (!raw || typeof raw !== 'object') {
        throw new TemplateError(`Template ${source} is empty or not an object`);
    }
    const spec = raw;
    if (!Array.isArray(spec.steps) || spec.steps.some(step => typeof step !== 'object' || !step)) {
        throw new TemplateError(`Template ${source} must define a steps array`);
    }
    return spec;
}
function renderTemplate(spec, params = {}) {
    const requiredParams = spec.params ?? [];
    const missingParams = requiredParams.filter(key => params[key] === undefined);
    if (missingParams.length > 0) {
        throw new TemplateError(`Missing template parameters: ${missingParams.join(', ')}`);
    }
    const cloned = deepClone(spec);
    cloned.steps = cloned.steps.map(step => interpolateValue(step, params));
    return cloned;
}
async function loadAndRenderTemplate(name, params = {}, options) {
    const spec = await loadTemplate(name, options);
    return renderTemplate(spec, params);
}
function interpolateValue(value, params) {
    if (typeof value === 'string') {
        return interpolateString(value, params);
    }
    if (Array.isArray(value)) {
        return value.map(item => interpolateValue(item, params));
    }
    if (value && typeof value === 'object') {
        const entries = Object.entries(value).map(([key, val]) => [
            key,
            interpolateValue(val, params),
        ]);
        return Object.fromEntries(entries);
    }
    return value;
}
function interpolateString(template, params) {
    return template.replace(/\{([^{}]+)\}/g, (_match, key) => {
        if (!Object.prototype.hasOwnProperty.call(params, key)) {
            throw new TemplateError(`Missing value for parameter "${key}"`);
        }
        const raw = params[key];
        return raw === undefined || raw === null ? '' : String(raw);
    });
}
function deepClone(value) {
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
}
//# sourceMappingURL=templates.js.map