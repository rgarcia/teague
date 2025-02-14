# riff on https://pnpm.io/docker#example-2-build-multiple-docker-images-in-a-monorepo
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
COPY . /usr/src/app
WORKDIR /usr/src/app
# see https://docs.railway.com/guides/dockerfiles#cache-mounts
RUN --mount=type=cache,id=s/01cbe423-33b0-4775-b082-1e0830896cd4-pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run -r build
RUN pnpm deploy --filter=web --prod /prod/web

FROM base AS web
COPY --from=build /prod/web /prod/web
COPY --from=build /usr/src/app/apps/web/.output /prod/web/.output
WORKDIR /prod/web
EXPOSE 3000
CMD [ "node", ".output/server/index.mjs" ]
