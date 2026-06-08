// Runner control flag. The web admin "Runner toggle" POSTs here; the world-loop runner GETs it
// each cycle and skips the tick when paused. This is what turns the (currently cosmetic) admin
// toggle into a real remote pause/resume for the VPS autonomous engine. Persisted so it
// survives relayer restarts.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ControlState } from "./types.ts";

export class Control {
  private state: ControlState = { paused: false, updated_at: 0 };
  private file: string;

  constructor(file: string) {
    this.file = file;
    if (existsSync(file)) {
      try {
        this.state = JSON.parse(readFileSync(file, "utf8")) as ControlState;
      } catch {
        /* keep default */
      }
    }
  }

  get(): ControlState {
    return this.state;
  }

  set(paused: boolean): ControlState {
    this.state = { paused, updated_at: Date.now() };
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.state));
    } catch (err) {
      console.warn(`[control] failed to persist:`, err);
    }
    return this.state;
  }
}
