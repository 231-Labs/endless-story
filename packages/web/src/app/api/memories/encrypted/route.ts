/**
 * Encrypted memory recall — the server half of the Owner read path.
 *
 * Returns a character's top-N memory blobs as SEAL ciphertext (base64) plus
 * the current narrative day for client-side re-ranking. Nothing here is
 * decrypted and no cap is exercised: the server only embeds a fixed query,
 * vector-searches the relayer, and proxies the Walrus bytes. Decryption
 * happens in the requesting browser via wallet + OwnerCap
 * (`decryptWithOwnerCap` → `character::seal_approve_owner`), so possession
 * of the cap — not a spoofable viewer address — is what gates the plaintext.
 *
 * Unauthenticated by design: the ciphertext is already public on Walrus,
 * and blob ids / distances leak no more than the public memory-count
 * surface. The query is fixed server-side so this can't be used as a free
 * embedding oracle.
 */

import { NextResponse } from 'next/server';
import {
    currentNarrativeDay,
    isMemoryConfigured,
    recallEncryptedForCharacter,
} from '@/lib/chain/memory';

export const dynamic = 'force-dynamic';

// Same broad evocative query the owner journal always used — surfaces a
// representative spread; importance re-rank happens client-side post-decrypt.
const JOURNAL_QUERY = '記憶 心事 經歷 關係 夢 此刻最在意的事';

const MAX_LIMIT = 32;

export async function GET(req: Request) {
    const url = new URL(req.url);
    const characterId = url.searchParams.get('characterId') ?? '';
    if (!/^0x[0-9a-fA-F]{1,64}$/.test(characterId)) {
        return NextResponse.json({ error: 'invalid characterId' }, { status: 400 });
    }

    if (!isMemoryConfigured()) {
        return NextResponse.json({ configured: false, today: 1, blobs: [] });
    }

    const limitRaw = Number(url.searchParams.get('limit') ?? 24);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(limitRaw) ? Math.round(limitRaw) : 24));

    const [blobs, today] = await Promise.all([
        recallEncryptedForCharacter(characterId, JOURNAL_QUERY, limit),
        currentNarrativeDay(),
    ]);

    return NextResponse.json({ configured: true, today, blobs });
}
