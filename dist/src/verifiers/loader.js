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
exports.VerifierLoaderError = void 0;
exports.loadVerifier = loadVerifier;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_url_1 = require("node:url");
const node_module_1 = require("node:module");
const requireModule = (0, node_module_1.createRequire)(node_path_1.default.join(process.cwd(), 'package.json'));
const DEFAULT_EXTENSIONS = ['.cjs', '.js'];
class VerifierLoaderError extends Error {
    constructor(message) {
        super(message);
        this.name = 'VerifierLoaderError';
    }
}
exports.VerifierLoaderError = VerifierLoaderError;
async function loadVerifier(identifier, options = {}) {
    const { moduleName, exportName } = parseIdentifier(identifier);
    const baseDirs = options.baseDirs ?? getDefaultBaseDirs();
    const modulePath = resolveModulePath(moduleName, baseDirs);
    if (!modulePath) {
        throw new VerifierLoaderError(`Unable to locate verifier module "${moduleName}"`);
    }
    const imported = await importModule(modulePath, options);
    const candidate = imported[exportName];
    if (typeof candidate !== 'function') {
        throw new VerifierLoaderError(`Verifier "${identifier}" must export a function, received ${typeof candidate}`);
    }
    return candidate;
}
function parseIdentifier(identifier) {
    if (!identifier || !identifier.includes('.')) {
        throw new VerifierLoaderError('Verifier identifier must be in the form "module.export"');
    }
    const lastDot = identifier.lastIndexOf('.');
    const moduleName = identifier.slice(0, lastDot);
    const exportName = identifier.slice(lastDot + 1);
    if (!moduleName || !exportName) {
        throw new VerifierLoaderError('Verifier identifier must include both module and export name');
    }
    return { moduleName, exportName };
}
function getDefaultBaseDirs() {
    const cwd = process.cwd();
    return [node_path_1.default.join(cwd, 'dist', 'verifiers'), node_path_1.default.join(cwd, 'src', 'verifiers')];
}
function resolveModulePath(moduleName, baseDirs) {
    const candidates = [];
    for (const base of baseDirs) {
        for (const ext of DEFAULT_EXTENSIONS) {
            candidates.push(node_path_1.default.join(base, moduleName + ext));
        }
    }
    for (const candidate of candidates) {
        if (node_fs_1.default.existsSync(candidate)) {
            return candidate;
        }
    }
    return undefined;
}
async function importModule(modulePath, options) {
    const requireFn = options.requireFn ?? ((p) => requireModule(p));
    const importFn = options.importFn ?? ((p) => Promise.resolve(`${(0, node_url_1.pathToFileURL)(p).href}`).then(s => __importStar(require(s))));
    try {
        return requireFn(modulePath);
    }
    catch (error) {
        if (error.code === 'ERR_REQUIRE_ESM') {
            return importFn(modulePath);
        }
        throw error;
    }
}
//# sourceMappingURL=loader.js.map