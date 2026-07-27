/**
 * Shared auth helper for run-scoped read routes:
 * director always; viewer only when the run is the curated public featured run.
 */

import { labRole, labViewerAuthorized } from './http';
import { isPublicRunId } from './public-config';

export function canReadRun(req: Request, runId: string): boolean {
    if (labRole(req) === 'director') return true;
    return isPublicRunId(runId) && labViewerAuthorized(req, runId);
}

export function isDirector(req: Request): boolean {
    return labRole(req) === 'director';
}
