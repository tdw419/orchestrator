import * as fsPromises from 'node:fs/promises';
export interface TemplateCatalogEntry {
    id: string;
    name: string;
    description?: string;
    params: string[];
    file: string;
    error?: string;
}
export interface BuildTemplateCatalogOptions {
    baseDir?: string;
    fs?: typeof fsPromises;
}
export declare function buildTemplateCatalog(options?: BuildTemplateCatalogOptions): Promise<TemplateCatalogEntry[]>;
