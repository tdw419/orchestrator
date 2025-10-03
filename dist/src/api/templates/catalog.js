"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTemplateCatalog = buildTemplateCatalog;
const fsPromises = __importStar(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const yaml_1 = require("yaml");
const DEFAULT_TEMPLATE_DIR = node_path_1.default.join(process.cwd(), 'templates');
const SUPPORTED_EXTENSIONS = new Set(['.yaml', '.yml']);
async function buildTemplateCatalog(options = {}) {
    const baseDir = options.baseDir ?? DEFAULT_TEMPLATE_DIR;
    const fs = options.fs ?? fsPromises;
    try {
        const stat = await fs.stat(baseDir);
        if (!stat.isDirectory()) {
            return [];
        }
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
    const files = await fs.readdir(baseDir);
    const entries = [];
    for (const fileName of files) {
        const ext = node_path_1.default.extname(fileName).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.has(ext)) {
            continue;
        }
        const absolutePath = node_path_1.default.join(baseDir, fileName);
        const id = node_path_1.default.basename(fileName, ext);
        try {
            const content = await fs.readFile(absolutePath, 'utf8');
            const raw = (0, yaml_1.parse)(content);
            const name = typeof raw?.name === 'string' && raw.name.trim().length > 0 ? raw.name.trim() : id;
            const description = typeof raw?.description === 'string' ? raw.description : undefined;
            const params = Array.isArray(raw?.params)
                ? (raw?.params).filter((value) => typeof value === 'string')
                : [];
            entries.push({
                id,
                name,
                description,
                params,
                file: absolutePath,
            });
        }
        catch (error) {
            entries.push({
                id,
                name: id,
                params: [],
                file: absolutePath,
                error: normalizeError(error),
            });
        }
    }
    entries.sort((a, b) => a.id.localeCompare(b.id));
    return entries;
}
function normalizeError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.toLowerCase().includes('invalid') ? message : `invalid template: ${message}`;
}
//# sourceMappingURL=catalog.js.map