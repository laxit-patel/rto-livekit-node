import express, { raw, json } from 'express';
import webhookRoutes from './shopify/webhooks.js';

/**
 * Start webhook server for Shopify events
 * Runs on a separate port (default 3000) while agent listens on 8081
 */
export function startWebhookServer(port: number = 3000): void {
  const app = express();

  // Middleware for webhook signature verification (requires raw body)
  app.use('/webhooks', raw({ type: 'application/json' }));
  app.use(json());

  // Store raw body for signature verification
  app.use((req, res, next) => {
    if (req.method === 'POST' && req.path.startsWith('/webhooks')) {
      (req as any).rawBody = req.body;
    }
    next();
  });

  // Routes
  app.use('/', webhookRoutes);

  // Health endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'shopify-webhook-server' });
  });

  // Start server
  app.listen(port, () => {
    console.log(`\n🪝 Shopify webhook server listening on port ${port}`);
    console.log(`   Register this URL in Shopify Admin:`);
    console.log(`   https://your-domain.com/webhooks/fulfillment-error\n`);
  });
}
