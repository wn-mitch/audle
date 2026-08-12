set shell := ["sh", "-eu", "-c"]

default: verify

install:
    pnpm install --frozen-lockfile

dev:
    pnpm dev

check:
    pnpm check

test:
    pnpm test

test-e2e:
    pnpm test:e2e

build:
    pnpm build

preview:
    pnpm preview

verify: check test test-e2e build
    pnpm format:check
    pnpm lint

deploy-init:
    pnpm exec wrangler pages project create audle --production-branch main

deploy: verify
    pnpm exec wrangler pages deploy dist --project-name audle --branch main
