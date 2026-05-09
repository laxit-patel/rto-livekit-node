import express, { raw, json } from 'express';
import cookieParser from 'cookie-parser';
import webhookRoutes from './shopify/webhooks.js';
import oauthRoutes from './shopify/oauth.js';

/**
 * Start webhook server for Shopify events and OAuth install flow.
 * Runs on port 3000; the LiveKit agent connects outbound so needs no inbound port.
 */
export function startWebhookServer(port: number = 3000): void {
  const app = express();

  // Cookie parser for OAuth CSRF state validation
  app.use(cookieParser());

  // Raw body middleware for webhook HMAC verification (must come before json())
  app.use('/webhooks', raw({ type: 'application/json' }));
  app.use(json());

  // Store raw body buffer for HMAC verification
  app.use((req, res, next) => {
    if (req.method === 'POST' && req.path.startsWith('/webhooks')) {
      (req as any).rawBody = req.body;
    }
    next();
  });

  // Shopify OAuth install + callback routes
  app.use('/', oauthRoutes);

  // Webhook event routes
  app.use('/', webhookRoutes);

  // Health endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'shopify-webhook-server' });
  });

  // Start server
  app.listen(port, () => {
    console.log(`\n🪝 Shopify webhook + OAuth server on port ${port}`);
    console.log(`   Install URL: https://your-domain.up.railway.app/shopify/auth?shop=your-store.myshopify.com\n`);
  });
}
