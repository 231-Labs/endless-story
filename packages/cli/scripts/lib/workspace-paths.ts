import * as fs from 'node:fs';
import * as path from 'node:path';

export function scriptsRoot(): string {
    const root = process.env.ES_SCRIPTS_ROOT?.trim();
    if (!root) throw new Error('ES_SCRIPTS_ROOT is not set');
    return path.resolve(root);
}

export function labRoot(): string {
    const root = process.env.ES_LAB_ROOT?.trim();
    if (!root) throw new Error('ES_LAB_ROOT is not set');
    return path.resolve(root);
}

export function today(): string {
    return new Date().toISOString().slice(0, 10);
}

export function readJson<T>(file: string): T {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
}

export function writeJson(file: string, value: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
