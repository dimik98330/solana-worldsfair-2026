FROM node:22.14.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && mkdir -p /app/.local/hosted && chown node:node /app/.local/hosted
ENV NODE_ENV=production \
    BONDTRACE_DEPLOYMENT=hosted \
    BONDTRACE_NETWORK=devnet \
    BONDTRACE_ENABLE_DEMO=false \
    BONDTRACE_PERSISTENT_ROOT=/app/.local/hosted \
    BONDTRACE_DATA_DIR=/app/.local/hosted/devnet \
    BONDTRACE_RUNTIME_MIN_FREE_MB=64 \
    PORT=10000
EXPOSE 10000
# The entrypoint verifies its dedicated mount, then drops root before API startup.
CMD ["node","--import","tsx","scripts/start-hosted.ts"]
