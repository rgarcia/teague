# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1.2.2 AS base
WORKDIR /usr/src

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
COPY apps/web/package.json /temp/dev/apps/web/package.json
RUN cd /temp/dev && bun install --frozen-lockfile

# install with --production (exclude devDependencies)
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
COPY apps/web/package.json /temp/prod/apps/web/package.json
RUN cd /temp/prod && bun install --frozen-lockfile --production

# copy node_modules from temp directory
# then copy all (non-ignored) project files into the image
FROM base AS prerelease
RUN apt-get update && apt-get install -y patch
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# [optional] tests & build
ENV NODE_ENV=production
RUN cd apps/web && bun test
RUN cd apps/web && bun run build

# copy production dependencies and source code into final image
FROM base AS release
COPY --from=install /temp/prod/node_modules /usr/src/node_modules
COPY --from=prerelease /usr/src/apps/web/.output /usr/src/apps/web/.output
# COPY --from=prerelease /usr/src/app/package.json .

# run the app
WORKDIR /usr/src/apps/web
USER bun
EXPOSE 3000/tcp
ENTRYPOINT [ "bun", "run", ".output/server/index.mjs" ]