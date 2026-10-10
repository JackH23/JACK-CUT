# Isolated staging frontend deployment

Production Worker: `jack-cut` (default `wrangler.jsonc`). Staging Worker: `jack-cut-staging` (`wrangler.staging.jsonc`). Never use `npm run deploy` or a bare `wrangler deploy` for staging.

## Required staging configuration

- Use the GitHub `staging` branch, root directory `frontend`.
- Set `NEXT_PUBLIC_API_URL=https://p01--jack-cut-staging--bqpgh5v9gs6m.code.run` in the **build environment** before building Next.js. Do not append `/api`: frontend services append it themselves. This is a public browser-side variable, not a secret.
- Build with `npx opennextjs-cloudflare build` and deploy with `npx wrangler deploy --config wrangler.staging.jsonc` (or use `npm run deploy:staging` with the build variable already set).
- If using Cloudflare's Git build integration, explicitly configure its deployment command to `npx wrangler deploy --config wrangler.staging.jsonc`; never use the default production command.
- Verify the deployment target is **jack-cut-staging** before executing any deploy command. Do not reuse the production Worker build settings or token without verifying scoped permissions.
- Validate the resulting staging frontend's `/api` network requests go to the Northflank staging backend, not `p01--jack-cut--...`.
- The Neon staging branch may have an expiration time; check its lifetime before relying on this deployment.

## Release safety

Do not merge to `main` or migrate the production database until staging tests pass and the production `export_jobs.deadline_at` migration is separately approved and verified. The staging config is a separate file so production `wrangler.jsonc` stays unchanged.
