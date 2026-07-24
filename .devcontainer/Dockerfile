FROM mcr.microsoft.com/devcontainers/typescript-node:1-23-bookworm

# Native media tooling supports screenshots, image processing, audio/video probes,
# and the repository's Python research scripts. Chromium gives agents a browser
# even when the host does not provide one.
RUN apt-get update \
    && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y --no-install-recommends \
      chromium \
      ffmpeg \
      fonts-noto-cjk \
      imagemagick \
      jq \
      postgresql-client \
      python3-pip \
      python3-venv \
      ripgrep \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
    && corepack prepare pnpm@10.5.2 --activate \
    && mkdir -p /workspace/private /ms-playwright /home/node/.local/share/pnpm/store \
    && chown -R node:node /workspace /ms-playwright /home/node/.local

ENV CHROME_BIN=/usr/bin/chromium
