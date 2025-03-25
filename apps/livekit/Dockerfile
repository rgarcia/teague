# riff on https://pnpm.io/docker#example-2-build-multiple-docker-images-in-a-monorepo
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable

FROM base AS build
COPY . /usr/src/app
WORKDIR /usr/src/app
# see https://docs.railway.com/guides/dockerfiles#cache-mounts
RUN --mount=type=cache,id=s/acb5a0f2-baf8-401a-acf4-58d59d61256c-pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run --filter=livekit... -r build
RUN pnpm deploy --filter=livekit --prod --force-legacy-deploy /prod/livekit

FROM base AS livekit
COPY --from=build /prod/livekit /prod/livekit
WORKDIR /prod/livekit
CMD [ "pnpm", "run", "start"]
