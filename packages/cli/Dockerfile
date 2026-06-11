# world-loop runner — the autonomous tick driver (cli/scripts/world-loop.ts).
#
# It's a *standalone* script: only node builtins (fs/promises, path), ZERO workspace
# deps. So no monorepo install needed — just tsx + the one file.
#
# Zeabur: this service's Root Directory = packages/cli (context = this folder, finds
# this Dockerfile). It's a WORKER (outbound HTTP only) — no port / domain / volume.
#
# Runtime env (Zeabur Variables):
#   WORLD_LOOP_URL        = https://spring-snow.231labs.xyz   (web base; /api/tick auto-appended)
#   TICK_LOOP_SECRET      = <same value as the web service>   (Bearer for /api/tick)
#   RUNNER_CONTROL_URL    = https://memwal-relayer.zeabur.app/control  (admin pause toggle)
#   RUNNER_CONTROL_SECRET = <optional; relayer /control is open so not needed>

FROM node:23-slim

RUN npm install -g tsx@4

WORKDIR /app
COPY scripts/world-loop.ts ./world-loop.ts

# Infinite loop (no --max) → drives ticks 24/7. Default interval 60s; add
# "--interval=45" here to tune. On each cycle it checks RUNNER_CONTROL_URL and
# skips the tick when {paused:true} (the admin toggle).
CMD ["tsx", "world-loop.ts"]
