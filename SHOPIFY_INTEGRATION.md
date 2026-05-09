# Shopify Integration Guide

This guide explains how to integrate the RTO agent with Shopify to automatically handle failed deliveries.

## Architecture Overview

```
Shopify Admin
    ↓ (Fulfillment Error Event)
Webhook Server (port 3000)
    ↓ (Orders RTO Job)
LiveKit Agent
    ↓ (Call Customer)
Record RTO Attempt → Shopify Metafield
    ↓ (Update Order)
Shopify Admin Timeline
```

## Setup Instructions

### 1. Create a Shopify Custom App

1. Go to **Shopify Admin** → **Settings** → **Apps and integrations** → **Develop apps**
2. Click **Create an app**
   - Name: `RTO Agent`
   - Select "I'm not looking to sell my app on the Shopify App Store"
3. Click **Configuration** tab
4. Under **Admin API access scopes**, enable:
   - `read_orders`
   - `write_orders`
   - `read_fulfillments`
   - `write_fulfillments`
5. Click **Save**
6. Copy credentials:
   - **API Key** → `SHOPIFY_API_KEY`
   - **API Secret** → `SHOPIFY_API_SECRET`
   - Go to **Reveal token** → `SHOPIFY_ACCESS_TOKEN`

### 2. Create Webhook Secret

1. In **Shopify Admin**, go to **Settings** → **Notifications**
2. Under Webhooks, copy the API Secret (or generate a new one)
3. This becomes `SHOPIFY_WEBHOOK_SECRET`

### 3. Update Environment Variables

In your `.env` file (or Railway environment):

```env
SHOPIFY_SHOP_NAME=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxx
SHOPIFY_API_KEY=xxxxxxxxxxxxx
SHOPIFY_API_SECRET=xxxxxxxxxxxxx
SHOPIFY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxx
DEFAULT_LANGUAGE=hi-IN
WEBHOOK_PORT=3000
```

### 4. Deploy & Register Webhooks

After deploying to Railway:

1. Your webhook server will be available at: `https://<your-railway-domain>.railway.app/webhooks`
2. In **Shopify Admin** → **Settings** → **Notifications**
3. Create webhook:
   - Event: **Fulfillment events > Fulfillment failed**
   - URL: `https://<your-railway-domain>.railway.app/webhooks/fulfillment-error`
   - Click **Save**

### 5. Test the Integration

**Manual trigger (for development):**

```bash
curl -X POST "http://localhost:3000/webhooks/trigger-rto?orderId=1234567890"
```

**From Shopify:**

Manually mark a fulfillment as failed in the Shopify Admin to trigger the webhook.

---

## Order Metadata Schema

RTO attempts are stored as Shopify metafields under namespace `rto`:

### `rto.attempts` (JSON)

```json
[
  {
    "timestamp": "2026-05-09T06:34:47Z",
    "reason": "Customer not at home",
    "language": "hi-IN",
    "agentId": "AW_WR4ewuxsVv6o",
    "callDurationSeconds": 45,
    "nextAttemptDate": "2026-05-10T10:00:00Z",
    "status": "completed"
  }
]
```

### `rto.redeliveryScheduled` (String)

ISO 8601 datetime of when redelivery is scheduled.

---

## Multi-Language Support

The agent supports:
- **Hindi** (`hi-IN`) - Default
- **Gujarati** (`gu-IN`)
- **Tamil** (`ta-IN`)
- **Telugu** (`te-IN`)

Set customer language preference in order metadata or use `DEFAULT_LANGUAGE` env var.

---

## Agent Behavior

### Personalization

When an RTO job is dispatched with order context, the agent:

1. **Greets by name**: "नमस्ते मोहन, शॉपिफाई से आपके ऑर्डर #1001 के बारे में..."
2. **References previous attempts**: "पिछली कोशिश में आप घर पर नहीं थे।"
3. **Stays professional**: Brief, empathetic, multi-lingual support
4. **Records reason**: Captures customer's stated reason for failure

### Recording RTO Outcome

After call completes, the agent:

1. Records attempt metadata
2. Updates Shopify order timeline
3. Optionally schedules redelivery slot
4. Triggers follow-up email/SMS (future)

---

## Troubleshooting

### Webhook not triggered

- Verify `SHOPIFY_WEBHOOK_SECRET` matches Shopify settings
- Check Railway logs: `railway logs --follow`
- Test manual trigger endpoint

### Metafield not updating

- Verify `SHOPIFY_ACCESS_TOKEN` is active (refresh if needed)
- Check Shopify API scopes include `write_orders`
- Inspect error logs in Railway dashboard

### Language not switching

- Confirm order metadata has valid language code
- Supported: `hi-IN`, `gu-IN`, `ta-IN`, `te-IN`
- Falls back to `DEFAULT_LANGUAGE` if invalid

---

## Next Steps

### MVP → Production

1. **Database**: Replace in-memory queue with PostgreSQL/MongoDB
2. **Job Queue**: Implement Bull or RabbitMQ for async job processing
3. **Call Recording**: Store Sarvam audio transcripts → Shopify
4. **NLP Extraction**: Extract reason automatically from transcript (Claude API)
5. **Redelivery Scheduling**: Offer time slots to customer during call
6. **Notifications**: Email/SMS with redelivery confirmation
7. **Dashboard**: Shopify Admin App showing RTO metrics & history

---

## API Reference

### Webhook Endpoints

#### `POST /webhooks/fulfillment-error`

Triggered by Shopify when fulfillment fails.

**Headers:**
- `X-Shopify-Hmac-SHA256`: Signature (verified)
- `X-Shopify-Topic`: `fulfillments/update`

**Body:** Fulfillment order payload

---

#### `POST /webhooks/trigger-rto`

Manually trigger RTO for testing.

**Query:**
- `orderId` (required): Shopify order ID

**Response:**
```json
{ "message": "RTO job queued", "orderId": "1234567890" }
```

---

#### `GET /webhooks/health`

Health check endpoint.

**Response:**
```json
{ "status": "ok", "timestamp": "2026-05-09T06:34:47Z" }
```

---

## Support

For issues or feature requests, contact the development team or check the main README.

---

## Quick Setup Checklist (Store Admin Path)

Use this checklist if you want the fastest path for this project.
You do not need Shopify CLI for this backend-only integration.

### 1. Create the app in Shopify store admin

- Open Shopify store admin (not Dev Dashboard)
- Go to **Settings -> Apps and sales channels -> Develop apps**
- Click **Create an app**
- App name suggestion: `RTO Agent Backend`

### 2. Configure Admin API scopes

Open **Configure Admin API scopes** and enable:

- `read_orders`
- `write_orders`
- `read_fulfillments`
- `write_fulfillments`

Save changes.

### 3. Install app and copy credentials

- Click **Install app**
- Copy **Admin API access token** (shown once)
- Copy **API key** and **API secret**

### 4. Add Railway environment variables

Set these in Railway:

- `SHOPIFY_SHOP_NAME=<your-store>.myshopify.com`
- `SHOPIFY_ACCESS_TOKEN=<admin-api-access-token>`
- `SHOPIFY_API_KEY=<api-key>`
- `SHOPIFY_API_SECRET=<api-secret>`
- `SHOPIFY_WEBHOOK_SECRET=<strong-random-string>`
- `DEFAULT_LANGUAGE=hi-IN`
- `WEBHOOK_PORT=3000`

### 5. Deploy and confirm webhook server health

After deploy, open:

- `https://<your-railway-domain>/webhooks/health`

Expected JSON:

```json
{ "status": "ok", "timestamp": "..." }
```

### 6. Register webhook in Shopify

In Shopify admin:

- Go to **Settings -> Notifications -> Webhooks**
- Create webhook with:
  - **Format:** JSON
  - **URL:** `https://<your-railway-domain>/webhooks/fulfillment-error`
  - **Secret:** same value as `SHOPIFY_WEBHOOK_SECRET`

For event/topic, choose the fulfillment-failure-related topic available in your store UI.
Shopify labels can vary slightly by version.

### 7. Run manual integration test

Call the manual endpoint:

```bash
curl -X POST "https://<your-railway-domain>/webhooks/trigger-rto?orderId=<shopify-order-id>"
```

Expected response:

```json
{ "message": "RTO job queued", "orderId": "..." }
```

### 8. Verify logs and data writeback

Check app logs for:

- Order context loaded from Shopify
- RTO job queued
- Attempt written back to Shopify metafield

### 9. Common mistakes to avoid

- Using Dev Dashboard app version flow for this backend setup
- Forgetting to install app after setting scopes
- Using parsed JSON instead of raw body for HMAC verification
- Mismatched webhook secret between Shopify and Railway
- Using store admin domain instead of `<store>.myshopify.com` in `SHOPIFY_SHOP_NAME`

### 10. Docs to keep open while setting up

- Generate admin app tokens:
  - https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/generate-app-access-tokens-admin
- HTTPS webhook delivery and HMAC validation:
  - https://shopify.dev/docs/apps/build/webhooks/subscribe/https
- Webhook references:
  - https://shopify.dev/docs/api/webhooks
