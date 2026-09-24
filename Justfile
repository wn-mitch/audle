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

# Stores the TypeSafe key (from $TYPESAFE_API_KEY) as the Pages Function secret.
jev-secret:
    printf '%s' "$TYPESAFE_API_KEY" | pnpm exec wrangler pages secret put TYPESAFE_API_KEY --project-name audle

# Attaches audle.alpacasoft.dev to the Pages project. The zone also needs a proxied CNAME audle -> audle.pages.dev.
domain:
    curl -sS -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/audle/domains" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H 'Content-Type: application/json' -d '{"name":"audle.alpacasoft.dev"}'

deploy: verify
    pnpm exec wrangler pages deploy dist --project-name audle --branch main
