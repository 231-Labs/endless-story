/**
 * memwal — Core Types (vendored MemWalManual client surface).
 *
 * Ed25519 delegate-key SDK that talks to the MemWal Rust server (TEE) for the
 * full client-side SEAL + Walrus + embedding flow.
 */

// ============================================================
// Manual Flow Types — client provides pre-computed data
// ============================================================

/** Result from rememberManual() */
export interface RememberManualResult {
    id: string;
    blob_id: string;
    owner: string;
    namespace: string;
}

/**
 * Optional index metadata sent on remember so a three-factor relayer can rank the FULL
 * namespace by importance × recency × relevance (not just re-rank a top-K-by-distance set).
 * The managed relayer ignores unknown fields → fully backward compatible.
 */
export interface RememberMeta {
    importance?: number;
    day?: number;
    kind?: string;
    anchored?: boolean;
    /**
     * Text to embed for the vector, when it should differ from the stored/encrypted
     * text — e.g. the raw memory WITHOUT the `[[m|...]]` tag, so the tag doesn't
     * pollute the embedding. Falls back to the stored text when unset.
     */
    embedText?: string;
}

/** Optional recall scoring hints for a self-hosted three-factor relayer. Managed relayer ignores. */
export interface RecallOpts {
    /** current narrative day, for recency decay */
    today?: number;
    /** recency half-life in narrative days */
    halfLife?: number;
    /** drop non-pinned memories below this cosine similarity */
    relevanceFloor?: number;
}

/** A single search hit — raw blobId + distance (no decrypted text) */
export interface RecallManualHit {
    blob_id: string;
    distance: number;
}

/** Result from restore() */
export interface RestoreResult {
    restored: number;
    skipped: number;
    total: number;
    namespace: string;
    owner: string;
}

// ============================================================
// Full Client-Side Manual Flow — MemWalManual class
// ============================================================

/** Full @mysten/seal server config. Committee servers require aggregatorUrl. */
export interface SealServerConfig {
    /** On-chain SEAL key server or committee object ID */
    objectId: string;
    /** Server weight for threshold encryption. Defaults to 1. */
    weight?: number;
    /** Committee aggregator URL. Required for committee mode servers. */
    aggregatorUrl?: string;
    /** Optional API key header name for permissioned key servers */
    apiKeyName?: string;
    /** Optional API key value for permissioned key servers */
    apiKey?: string;
}

/** Config for MemWalManual (full client-side: SEAL + Walrus + embedding) */
export interface MemWalManualConfig {
    /** Ed25519 delegate private key (hex or Uint8Array) for server auth */
    key: string | Uint8Array;
    /** Server URL (default: http://localhost:8000) */
    serverUrl?: string;
    /**
     * Sui private key (bech32 suiprivkey1...) for SEAL + Walrus signing.
     * Provide EITHER this OR `walletSigner` — not both.
     */
    suiPrivateKey?: string;
    /**
     * Connected wallet signer (e.g. from dapp-kit).
     * Use this when the user's wallet is already connected in the browser.
     * Provide EITHER this OR `suiPrivateKey` — not both.
     */
    walletSigner?: WalletSigner;
    /**
     * Pre-configured Sui client instance (e.g. from dapp-kit's useSuiClient()).
     * If omitted, the SDK will try to create one internally.
     * Recommended for browser environments where @mysten/sui v2.x removed SuiClient.
     */
    suiClient?: any;
    /** OpenAI/OpenRouter API key for embeddings (required for client-side embedding) */
    embeddingApiKey: string;
    /** OpenAI-compatible API base URL (default: https://api.openai.com/v1) */
    embeddingApiBase?: string;
    /** Embedding model name (default: text-embedding-3-small) */
    embeddingModel?: string;
    /** MemWal contract package ID on Sui */
    packageId: string;
    /** MemWalAccount object ID (for SEAL seal_approve) */
    accountId: string;
    /**
     * endless-story patch (B2): Character object id this client is bound to.
     * SEAL ids are scoped to `nsHex + bcs(characterId)` so the on-chain
     * `endless_story::character::seal_approve_*` `has_suffix` check matches
     * only this character's encrypted blobs.
     */
    characterId: string;
    /**
     * endless-story patch (B3): ControlCap object id. Set this on a Saga
     * client — recall will route to `character::seal_approve_control` and
     * decrypt only succeeds while this cap's epoch matches
     * `character.control_epoch` (i.e. it has not been revoked / reassigned).
     * Mutually exclusive with `ownerCapId`.
     */
    controlCapId?: string;
    /**
     * endless-story patch (B3): OwnerCap object id. Set this on an Owner
     * audit client — recall will route to `character::seal_approve_owner`
     * (no epoch check; owner can always read for audit). The writing path
     * is gated at the app layer (see README) — owner clients should not
     * call `rememberManual`. Mutually exclusive with `controlCapId`.
     */
    ownerCapId?: string;
    /** Sui network (default: mainnet) */
    suiNetwork?: "testnet" | "mainnet";
    /** Optional gRPC endpoint override (falls back to env SUI_GRPC_URL, then the
     *  network's public fullnode). Used when no `suiClient` is injected. */
    suiGrpcUrl?: string;
    /**
     * Full SEAL server configs, including committee aggregators.
     * Takes priority over legacy sealKeyServers when provided.
     */
    sealServerConfigs?: SealServerConfig[];
    /**
     * Legacy custom SEAL independent key server object IDs.
     * Array of on-chain object IDs, e.g. ["0x..."].
     * If omitted, uses sealServerConfigs or built-in defaults for the selected suiNetwork.
     */
    sealKeyServers?: string[];
    /**
     * SEAL threshold — number of key server shares required for encrypt/decrypt.
     * Must be ≤ the total configured SEAL server weight.
     * Default: 2, capped to the total configured SEAL server weight.
     */
    sealThreshold?: number;
    /** Walrus storage epochs (default: 50) */
    walrusEpochs?: number;
    /** Walrus aggregator URL for direct blob downloads (default: mainnet aggregator) */
    walrusAggregatorUrl?: string;
    /** Walrus publisher URL for direct blob uploads (default: mainnet publisher) */
    walrusPublisherUrl?: string;
    /** Default namespace for memory isolation (default: "default") */
    namespace?: string;
}

/**
 * Wallet signer interface — pass a connected wallet adapter.
 * Compatible with @mysten/dapp-kit's useSignAndExecuteTransaction.
 */
export interface WalletSigner {
    /** Wallet address (Sui address, 0x...) */
    address: string;
    /** Sign and execute a transaction, returns the digest */
    signAndExecuteTransaction: (input: {
        transaction: any;
    }) => Promise<{ digest: string }>;
    /** Sign a personal message (for SEAL SessionKey) */
    signPersonalMessage: (input: {
        message: Uint8Array;
    }) => Promise<{ signature: string }>;
}

/** A recalled memory with decrypted text (from MemWalManual.recallManual) */
export interface RecallManualMemory {
    blob_id: string;
    text: string;
    distance: number;
}

/**
 * One encrypted blob from recallEncrypted() — SEAL ciphertext, still sealed.
 * Safe to hand to an untrusted client: decryption requires a cap holder to
 * pass `character::seal_approve_{control,owner}` at the SEAL key servers.
 */
export interface EncryptedRecallBlob {
    blob_id: string;
    /** SEAL ciphertext bytes, base64-encoded. */
    data_b64: string;
    distance: number;
}

/** Result from recallEncrypted() — search + download, no decryption. */
export interface RecallEncryptedResult {
    results: EncryptedRecallBlob[];
    total: number;
}

/** Result from recallManual() — full client-side variant with decrypted text */
export interface RecallManualResult {
    results: (RecallManualHit | RecallManualMemory)[];
    total: number;
}
