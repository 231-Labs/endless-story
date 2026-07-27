/** Server-only viewer id helpers. */

import { randomUUID } from 'node:crypto';

export const VIEWER_ID_HEADER = 'x-viewer-id';

export function viewerIdFromRequest(req: Request): string {
    const header = req.headers.get(VIEWER_ID_HEADER)?.trim();
    if (header && /^[\w.-]{8,80}$/.test(header)) return header;
    return `anon-${randomUUID().slice(0, 8)}`;
}
