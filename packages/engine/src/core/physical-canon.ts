import type { characterAgent } from '@endless-story/runner';
import type { WorldState, WorldObject } from '../world-state.ts';

/**
 * Only durable changes belong in the object ledger. Merely handling an object
 * (拿起、按住、翻看) is already frozen in the beat and may end with the object
 * where it started; treating every touch as a mutation made ordinary blocking
 * impossible. These phrases instead imply that the post-beat location,
 * container, visibility or state has changed and therefore require an effect.
 */
const DURABLE_MUTATION =
    /拿走|帶走|拾走|撿走|收走|抽出|取出|放(?:進|入|到)|塞(?:進|入)|揣(?:進|入)|藏(?:進|入|起)|鎖(?:進|入|上)|關上|打開|掀開|挑開|揭開|啟封|拆封|抽開|拉開|扯開|撬開|拆開|剪開|解開|撕|燒|毀|拆|簽|署名|填(?:上|入|寫)|塗(?:掉|改)|交給|遞給|移到|搬到|掛上|穿上|封(?:起|上)/;

/** Verbs that assert the actor can physically perceive or handle the noun.
 * Merely discussing a known off-scene object is epistemically valid and must
 * not be confused with materializing it in the current room. */
const PHYSICAL_REFERENCE =
    /看向|望向|瞥向|盯著|低頭看|指向|撥|摸|碰|按|握|攥|抓|夾起|拿起|拾起|撿起|掏出|取過|接過|翻看|端詳|掂|敲|展開|攤開|湊近|貼近|擱在|置於|拿走|帶走|拾走|撿走|收走|抽出|取出|放(?:進|入|到)|塞(?:進|入)|揣(?:進|入)|藏(?:進|入|起)|鎖(?:進|入|上)|關上|打開|掀開|挑開|揭開|啟封|拆封|抽開|拉開|扯開|撬開|拆開|剪開|解開|撕|燒|毀|拆|簽|署名|填(?:上|入|寫)|塗(?:掉|改)|交給|遞給|移到|搬到|掛上|穿上|封(?:起|上)/;
const HANDOFF = /交給|遞給|塞給|交到.{0,6}手|遞到.{0,6}手|(?:讓|任由).{0,16}(?:接過|拿走|收下)/;

function narrationOnly(text: string): string {
    const closes: Record<string, string> = { '「': '」', '『': '』', '“': '”', '"': '"' };
    const stack: string[] = [];
    let narration = '';
    for (const char of text) {
        if (stack.length > 0 && char === stack[stack.length - 1]) {
            stack.pop();
            continue;
        }
        const close = closes[char];
        if (close) {
            stack.push(close);
            continue;
        }
        if (stack.length === 0) narration += char;
    }
    return narration;
}

function mentionedAlias(text: string, object: WorldObject): { alias: string; index: number } | null {
    for (const alias of [...object.aliases].sort((a, b) => b.length - a.length)) {
        const index = text.indexOf(alias);
        if (index >= 0) return { alias, index };
    }
    return null;
}

function mutatesNear(text: string, match: { alias: string; index: number }): boolean {
    // A natural action clause often inserts hand/gesture detail between the
    // object noun and the durable verb (「夾起封套，右指沿封口極緩揭開」).
    // Twelve characters missed that ordinary syntax. Thirty-two covers one
    // compact beat clause while staying short of a separate sentence/beat.
    const start = Math.max(0, match.index - 32);
    const end = Math.min(text.length, match.index + match.alias.length + 32);
    return DURABLE_MUTATION.test(text.slice(start, end));
}

function physicallyReferencesNear(text: string, match: { alias: string; index: number }): boolean {
    const start = Math.max(0, match.index - 20);
    const end = Math.min(text.length, match.index + match.alias.length + 20);
    return PHYSICAL_REFERENCE.test(text.slice(start, end));
}

function handsOffNear(text: string, match: { alias: string; index: number }): boolean {
    const start = Math.max(0, match.index - 32);
    const end = Math.min(text.length, match.index + match.alias.length + 48);
    return HANDOFF.test(text.slice(start, end));
}

export interface CommitBeatPhysicsInput {
    world: WorldState;
    sceneId: string;
    actorId: string;
    actorName: string;
    witnessIds: string[];
    text: string;
    audience?: 'scene' | 'addressed';
    addressedId?: string;
    effects?: characterAgent.BeatObjectEffect[];
}

/** Validate prose against the pre-beat world, then atomically mutate in-memory
 * object state. The outer tick transaction rolls the whole tick back on error. */
export function commitBeatPhysics(input: CommitBeatPhysicsInput): void {
    const { world, sceneId, actorId } = input;
    const narration = narrationOnly(input.text);
    const effects = input.effects ?? [];
    const effectsByObject = new Map(effects.map((effect) => [effect.objectId, effect]));

    for (const object of world.data.objects ?? []) {
        const mention = mentionedAlias(narration, object);
        if (!mention) continue;
        const perceivers = input.audience === 'addressed'
            ? [actorId, ...(input.addressedId ? [input.addressedId] : [])]
            : input.witnessIds;
        const revealsObject = effectsByObject.get(object.id)?.visibility === 'visible';
        const leaksHiddenIdentity =
            object.visibility === 'hidden' &&
            !revealsObject &&
            perceivers.some((id) => id !== actorId && !object.knownBy.includes(id));
        if (leaksHiddenIdentity) {
            throw new Error(
                `[physics] ${input.actorName} exposed hidden ${object.id} to an unaware witness in objective narration; ` +
                'describe only the visible gesture, speak of it in dialogue, or explicitly reveal the object',
            );
        }
        if (!world.objectAccessibleTo(object, actorId, sceneId) && physicallyReferencesNear(narration, mention)) {
            throw new Error(
                `[physics] ${input.actorName} physically referenced unavailable ${object.id} in ${world.sceneNameById(sceneId)}: ${input.text}`,
            );
        }
        if (mutatesNear(narration, mention) && !effectsByObject.has(object.id)) {
            throw new Error(
                `[physics] ${input.actorName} mutated ${object.id} in prose without objectEffects: ${input.text}`,
            );
        }
        if (handsOffNear(narration, mention) && effectsByObject.get(object.id)?.carrierName === undefined) {
            throw new Error(
                `[physics] ${input.actorName} handed off ${object.id} in prose without carrierName: ${input.text}`,
            );
        }
    }

    const touched = new Map(effects.map((effect) => {
        const object = world.objectById(effect.objectId);
        return object
            ? [effect.objectId, {
                sceneId: object.sceneId,
                container: object.container,
                carriedBy: object.carriedBy,
                visibility: object.visibility,
                state: object.state,
                version: object.version,
                knownBy: [...object.knownBy],
            }] as const
            : [effect.objectId, undefined] as const;
    }));
    try {
        for (const effect of effects) {
            const object = world.objectById(effect.objectId);
            if (!object) throw new Error(`[physics] unknown object id: ${effect.objectId}`);
            if (!world.objectAccessibleTo(object, actorId, sceneId)) {
                throw new Error(`[physics] ${input.actorName} cannot mutate inaccessible ${effect.objectId}`);
            }
            if (
                effect.carried === undefined &&
                typeof effect.container === 'string' &&
                effect.container.includes(input.actorName) &&
                /懷|袖|手中|身上|兜|袋/.test(effect.container)
            ) {
                throw new Error(`[physics] ${effect.objectId} uses a carried container without carried=true`);
            }
            if (effect.carried !== undefined && effect.carrierName !== undefined) {
                throw new Error(`[physics] ${effect.objectId} cannot use carried and carrierName together`);
            }
            if (effect.toScene) {
                if (!object.portable) throw new Error(`[physics] ${effect.objectId} is not portable`);
                const destination = world.data.scenes.find((scene) => scene.name === effect.toScene);
                if (!destination) throw new Error(`[physics] unknown destination scene: ${effect.toScene}`);
                object.sceneId = destination.id;
            }
            if (effect.container !== undefined) {
                if (typeof effect.container === 'string') {
                    const registeredContainer = world.objectById(effect.container);
                    if (registeredContainer && registeredContainer.sceneId !== object.sceneId) {
                        throw new Error(`[physics] container ${effect.container} is not co-located with ${effect.objectId}`);
                    }
                }
                object.container = effect.container ?? undefined;
            }
            if (effect.carrierName !== undefined) {
                if (effect.carrierName === null) {
                    object.carriedBy = undefined;
                    object.sceneId = sceneId;
                } else {
                    const nextCarrierId = world.idByName(effect.carrierName);
                    if (!nextCarrierId || !input.witnessIds.includes(nextCarrierId) || world.data.roster[nextCarrierId] !== sceneId) {
                        throw new Error(`[physics] ${effect.objectId} cannot transfer to non-present ${effect.carrierName}`);
                    }
                    object.carriedBy = nextCarrierId;
                    object.sceneId = sceneId;
                }
            } else if (effect.carried === true) {
                object.carriedBy = actorId;
                object.sceneId = sceneId;
            } else if (effect.carried === false) {
                object.carriedBy = undefined;
                object.sceneId = sceneId;
            }
            if (effect.visibility) {
                object.visibility = effect.visibility;
                if (effect.visibility === 'destroyed') object.carriedBy = undefined;
            }
            if (effect.state) object.state = effect.state;
            object.version += 1;

            const perceivers = input.audience === 'addressed'
                ? [actorId, ...(input.addressedId ? [input.addressedId] : [])]
                : input.witnessIds;
            object.knownBy = [...new Set([...object.knownBy, ...perceivers])];
        }
    } catch (error) {
        for (const [id, before] of touched) {
            if (!before) continue;
            const object = world.objectById(id);
            if (!object) continue;
            object.sceneId = before.sceneId;
            object.container = before.container;
            object.carriedBy = before.carriedBy;
            object.visibility = before.visibility;
            object.state = before.state;
            object.version = before.version;
            object.knownBy = [...before.knownBy];
        }
        throw error;
    }
}
