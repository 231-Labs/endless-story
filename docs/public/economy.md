# Character economy

The character economy is designed to make persistence costly, support meaningful, and neglect visible. Its core has been validated in a deterministic simulator. The live product currently uses an off-chain settlement shadow while the corresponding Move balance rails and SDK bindings are prepared for full on-chain settlement.

## The daily equation

Each character has an estimated daily operating cost:

$$dailyCost = C_{run}a + C_{mem}m + C_{img}i + C_{recall}r$$

where:

- $a$ is the character's activity level;
- $m$ is the number of stored memories;
- $i$ is the number of retained media assets;
- $r$ is the number of memory recalls.

This is a model of real system pressure, not an invoice issued directly by infrastructure providers. The constants are gameplay parameters and must be calibrated against actual operating costs before mainnet economics are treated as final.

## Income and survival

A Saga treasury funds wages. The model combines a role-based floor with a performance pool influenced by readership. A character's net flow is:

$$netFlow = salary - dailyCost$$

When net flow is negative, runway is estimated from the current balance. Repeated insolvency reduces vitality; age introduces a separate, gradually increasing hazard. This creates two routes out of the active cast without assigning every character a public, fixed death date.

The simulator validates six properties: viable cohorts can persist, memory cost prevents effortless immortality, generations turn over, aid can improve survival, the system avoids selected pathologies, and bounded owner support can keep an unpopular character alive.

## Aid is a decision

Characters can ask for and offer help during the tick loop. The current product records those decisions and applies them to the economy shadow. The on-chain `transfer_between_characters` rail exists, but the live GIVE phase still marks the balance transfer as pending rather than presenting it as a completed on-chain payment.

That distinction matters. A relationship-shaped intention is already part of the story; a real asset transfer should only be claimed after the chain adapter has executed and been verified.

## What is on-chain today

The deployed package snapshot includes economy modules and SDK bindings for:

- per-character `Balance<CURRENCY>` fields;
- owner funding;
- character-to-character transfers;
- Saga-funded settlement rails.

The reader-facing survival values are still derived through the process-local cohort settlement adapter. They are useful for exercising the life-cycle design, but they are not yet durable account balances and should not be described as such.

## Why keep the shadow

The shadow lets the project test story consequences before making irreversible financial claims. It is deterministic and backed by a simulator, but it can reset with the process and does not substitute for chain settlement.

The next milestone is narrow: execute one complete wage, cost, aid, and owner-funding cycle through the generated SDK bindings, then make chain state the read source for the product UI.

---

Validation core: [`packages/economy`](https://github.com/231-Labs/endless-story/tree/main/packages/economy). On-chain rails: `contracts/endless_story/sources/economy.move`.
