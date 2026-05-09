import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { shopifyClient } from './client.js';
import type { ShopifyWebhookPayload } from './types.js';

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

const router = Router();
const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || '';

declare global {
  var rtoQueue: Array<{ timestamp: string; orderContext: any }>;
}

/**
 * Verify Shopify webhook signature
 */
function verifyWebhookSignature(req: Request): boolean {
  const hmac = req.headers['x-shopify-hmac-sha256'] as string;
  const body = req.rawBody?.toString() || JSON.stringify(req.body); // Fallback to JSON

  if (!hmac || !body) return false;

  const hash = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body, 'utf8').digest('base64');
  return hash === hmac;
}

/**
 * Webhook for fulfillment order updates (when delivery fails)
 * Shopify sends: fulfillment_orders/fulfillment_error
 */
router.post('/webhooks/fulfillment-error', (req: Request, res: Response) => {
  // Verify signature
  if (!verifyWebhookSignature(req)) {
    console.error('Invalid webhook signature');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload: ShopifyWebhookPayload = req.body;
    const orderId = payload.order_id;

    console.log(`📦 Fulfillment error received for order ${orderId}`);

    // Queue RTO job
    queueRTOJob(orderId).catch((err) => {
      console.error('Error queuing RTO job:', err);
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Manual webhook trigger for testing (POST /webhooks/trigger-rto?orderId=123)
 */
router.post('/webhooks/trigger-rto', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.query;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId required' });
    }

    console.log(`🚀 Manual RTO trigger for order ${orderId}`);
    await queueRTOJob(orderId as string);

    res.status(200).json({ message: 'RTO job queued', orderId });
  } catch (error) {
    console.error('Error triggering RTO:', error);
    res.status(500).json({ error: 'Failed to queue RTO job' });
  }
});

/**
 * Queue RTO job with order context
 * In production, this would push to a job queue (Bull, RabbitMQ, etc.)
 * For now, we'll log and store for LiveKit to pick up
 */
async function queueRTOJob(orderId: string): Promise<void> {
  try {
    // Fetch order context from Shopify
    const orderContext = await shopifyClient.getOrder(orderId);

    // In production:
    // 1. Store in database (PostgreSQL, MongoDB)
    // 2. Push to job queue (Bull)
    // 3. LiveKit agent worker subscribes to queue events

    // For MVP, we'll just log it and store in memory
    console.log('✓ RTO job queued:', {
      orderId,
      customerName: orderContext.customerName,
      attemptNumber: orderContext.attemptNumber,
      language: orderContext.language,
    });

    // Store for local reference (in production, use persistent storage)
    globalThis.rtoQueue = globalThis.rtoQueue || [];
    globalThis.rtoQueue.push({
      timestamp: new Date().toISOString(),
      orderContext,
    });
  } catch (error) {
    console.error('Error queuing RTO job:', error);
    throw error;
  }
}

/**
 * Health check endpoint
 */
router.get('/webhooks/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
