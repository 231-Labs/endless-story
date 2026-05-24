/**
 * Character-bound memory clients.
 *
 * Thin wrappers around MemWalManual that encode the access model in the type
 * system: an OwnerCap holder gets a surface with no `remember` at all, so the
 * "owner is read-only" constraint becomes a compile error rather than a runtime
 * convention. The cap dispatch inside MemWalManual stays the source of truth
 * for what actually reaches the chain.
 */
import { MemWalManual } from "./manual.js";
import type {
    MemWalManualConfig,
    RecallManualResult,
    RememberManualResult,
} from "./types.js";

export interface CharacterMemoryReader {
    recall(
        query: string,
        limit?: number,
        namespace?: string,
    ): Promise<RecallManualResult>;
    destroy(): void;
}

export interface CharacterMemoryWriter extends CharacterMemoryReader {
    remember(text: string, namespace?: string): Promise<RememberManualResult>;
}

type BaseConfig = Omit<MemWalManualConfig, "controlCapId" | "ownerCapId">;

export type SagaClientConfig = BaseConfig & { controlCapId: string };

export type OwnerAuditClientConfig = BaseConfig & { ownerCapId: string };

/**
 * Read-write client backed by a ControlCap. Subject to revocation: once the
 * OwnerCap holder calls `revoke_all_control` or `reassign_saga`, this client's
 * `recall` aborts at `seal_approve_control` with `ENoAccess` and `remember`
 * succeeds in the relayer write but the resulting blob is unreadable by this
 * client.
 */
export class SagaMemoryClient implements CharacterMemoryWriter {
    private readonly inner: MemWalManual;

    private constructor(inner: MemWalManual) {
        this.inner = inner;
    }

    static create(config: SagaClientConfig): SagaMemoryClient {
        return new SagaMemoryClient(
            MemWalManual.create({ ...config, ownerCapId: undefined }),
        );
    }

    remember(text: string, namespace?: string): Promise<RememberManualResult> {
        return this.inner.rememberManual(text, namespace);
    }

    recall(
        query: string,
        limit: number = 10,
        namespace?: string,
    ): Promise<RecallManualResult> {
        return this.inner.recallManual(query, limit, namespace);
    }

    destroy(): void {
        this.inner.destroy();
    }
}

/**
 * Read-only audit client backed by an OwnerCap. Never subject to epoch
 * revocation (owner always has access). Does not expose `remember`; the
 * write path is intentionally absent so callers cannot accidentally promote
 * an audit surface to a writing one.
 */
export class OwnerAuditClient implements CharacterMemoryReader {
    private readonly inner: MemWalManual;

    private constructor(inner: MemWalManual) {
        this.inner = inner;
    }

    static create(config: OwnerAuditClientConfig): OwnerAuditClient {
        return new OwnerAuditClient(
            MemWalManual.create({ ...config, controlCapId: undefined }),
        );
    }

    recall(
        query: string,
        limit: number = 10,
        namespace?: string,
    ): Promise<RecallManualResult> {
        return this.inner.recallManual(query, limit, namespace);
    }

    destroy(): void {
        this.inner.destroy();
    }
}
