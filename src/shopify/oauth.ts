import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';

const router = Router();

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || '';
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || '';
const APP_URL = process.env.APP_URL || '';
const SCOPES = 'read_orders,write_orders,read_fulfillments,write_fulfillments';

/**
 * Step 1 — Redirect merchant to Shopify OAuth consent screen
 * GET /shopify/auth?shop=your-store.myshopify.com
 */
router.get('/shopify/auth', (req: Request, res: Response) => {
  const shop = req.query.shop as string;

  if (!shop || !shop.endsWith('.myshopify.com')) {
    return res.status(400).send('Missing or invalid shop parameter');
  }

  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = `${APP_URL}/shopify/callback`;

  const installUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${SHOPIFY_API_KEY}` +
    `&scope=${SCOPES}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  // Store state in cookie for CSRF verification
  res.cookie('shopify_oauth_state', state, { httpOnly: true, secure: true, sameSite: 'lax' });
  res.redirect(installUrl);
});

/**
 * Step 2 — Shopify redirects here after merchant approves
 * GET /shopify/callback?code=...&hmac=...&shop=...&state=...
 */
router.get('/shopify/callback', async (req: Request, res: Response) => {
  const { code, hmac, shop, state } = req.query as Record<string, string>;

  // Validate HMAC
  if (!validateCallbackHmac(req.query as Record<string, string>, SHOPIFY_API_SECRET)) {
    return res.status(400).send('HMAC validation failed');
  }

  // Validate state (CSRF)
  const cookieState = (req.cookies as any)?.shopify_oauth_state;
  if (state !== cookieState) {
    return res.status(403).send('State mismatch — possible CSRF');
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code,
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed: ${tokenRes.status}`);
    }

    const data = await tokenRes.json() as { access_token: string; scope: string };

    console.log(`✓ Shopify OAuth complete for ${shop}`);
    console.log(`  Scopes granted: ${data.scope}`);
    console.log(`\n⚠️  ACTION REQUIRED: Copy this token to your Railway env as SHOPIFY_ACCESS_TOKEN:`);
    console.log(`  ${data.access_token}\n`);

    // In production you would persist token to a database.
    // For single-store backend use, copy the logged token to Railway env manually.
    res.send(`
      <h2>✓ RTO Agent installed successfully</h2>
      <p>Shop: <strong>${shop}</strong></p>
      <p>Scopes: ${data.scope}</p>
      <p>Copy the Admin API access token from your Railway deployment logs and set it as
         <code>SHOPIFY_ACCESS_TOKEN</code> in Railway environment variables.</p>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send('OAuth failed — check server logs');
  }
});

/**
 * Validate Shopify callback HMAC signature
 */
function validateCallbackHmac(params: Record<string, string>, secret: string): boolean {
  const { hmac, ...rest } = params;
  if (!hmac) return false;

  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('&');

  const digest = crypto.createHmac('sha256', secret).update(message).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
}

export default router;
