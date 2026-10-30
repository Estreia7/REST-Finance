# Invoices by email: Cloudflare Email Worker

Each restaurant gets a private address, `<token>@faturas.bruno-dev.xyz`.
Cloudflare Email Routing receives the mail and hands it to this worker. The
worker posts each attachment to `POST /api/inbound/invoice` on the app, along
with a shared secret. The app then reads each attachment and leaves it waiting
for the owner in **Despesas › Digitalizar**.

```
supplier ──mail──▶ Cloudflare Email Routing (faturas.bruno-dev.xyz, catch-all)
                         │
                         ▼
                   this worker ──HTTPS + x-inbound-secret──▶ /api/inbound/invoice
```

The worker only carries the mail. The app decides which restaurant a token
belongs to and which attachments are worth reading (PDFs, and photos of 40 KB
or more). The feature stays hidden in the app until both env vars below are
set.

## One-time setup

1. **Turn on Email Routing for the subdomain.** In the Cloudflare dashboard,
   open `bruno-dev.xyz` › Email › Email Routing and enable it. Then go to
   Settings › Subdomains, add `faturas`, and accept the MX and TXT records it
   proposes. The main domain's mail is not touched.

2. **Make a secret.** Run `openssl rand -hex 32` and keep the output for the
   next two steps.

3. **Tell the app.** On the VPS, add these lines to `/var/www/rest-finance/.env`:

   ```
   INBOUND_EMAIL_DOMAIN="faturas.bruno-dev.xyz"
   INBOUND_EMAIL_SECRET="<the secret>"
   ```

   Then run `pm2 restart rest-finance --update-env`.

4. **Deploy the worker** from this folder:

   ```
   npm install
   npx wrangler login
   npx wrangler secret put INBOUND_EMAIL_SECRET   # paste the same secret
   npx wrangler deploy
   ```

5. **Route the mail to it.** Go to Email Routing › Routing rules. Under the
   catch-all address for `faturas.bruno-dev.xyz`, choose **Send to a Worker** ›
   `rest-finance-invoices`.

6. **Try it.** In the app, open Definições › Restaurante › Faturas por email ›
   Criar o endereço. Send that address an email with a PDF invoice attached.
   Within a minute it should appear in Despesas › Digitalizar, already read.

## Behaviour worth knowing

- Requests are limited to 60 readings per restaurant per day.
- If the app answers 5xx, the worker fails the delivery, so the sending server
  retries later and the invoice is not lost.
- An unknown token gets the same answer as a known one with nothing to read,
  so the endpoint cannot be used to discover which addresses exist.
- Each emailed reading is logged to `ai_usage` like any scan, against the
  restaurant's owner.
