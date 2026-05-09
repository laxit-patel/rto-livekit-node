import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { rtoService } from './service.js';
import type { ShopifyWebhookPayload } from './types.js';
import { renderSimulatorPage } from '../ui/simulator.js';

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

const router = Router();
const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || '';
const SIMULATION_MODE_ENABLED = (() => {
  const raw = process.env.SIMULATION_MODE_ENABLED?.trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return process.env.NODE_ENV !== 'production';
})();

function simulatorDisabledResponse(req: Request, res: Response): Response {
  if (req.path === '/simulator') {
    return res.status(404).send('Not found');
  }

  return res.status(404).json({ error: 'Simulation mode is disabled' });
}

router.get('/simulator', (_req: Request, res: Response) => {
  if (!SIMULATION_MODE_ENABLED) {
    return simulatorDisabledResponse(_req, res);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderSimulatorPage());
});

router.get('/webhooks/orders', async (req: Request, res: Response) => {
  if (!SIMULATION_MODE_ENABLED) {
    return simulatorDisabledResponse(req, res);
  }

  try {
    const limit = Number(req.query.limit || 20);
    const orders = await rtoService.listRecentOrders(limit);
    res.status(200).json({ orders });
  } catch (error) {
    console.error('Error listing orders:', error);
    res.status(500).json({ error: 'Failed to list recent orders' });
  }
});

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
    rtoService.queueRTOJob(orderId).catch((err) => {
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
    const dispatch = await rtoService.dispatchRTOCall(orderId as string);

    res.status(200).json({
      message: 'RTO call dispatched',
      provider: dispatch.provider,
      orderId,
      customerPhone: dispatch.customerPhone,
      roomName: dispatch.provider === 'livekit' ? dispatch.roomName : undefined,
      dispatchId: dispatch.provider === 'livekit' ? dispatch.dispatchId : undefined,
      callId: dispatch.provider === 'vapi' ? dispatch.callId : undefined,
    });
  } catch (error) {
    console.error('Error triggering RTO:', error);
    res.status(500).json({ error: 'Failed to dispatch RTO call' });
  }
});

/**
 * Simulation trigger for testing voice flow over LiveKit WebRTC (no PSTN call).
 * Use this when you want to talk to the agent from browser/mobile using a token.
 */
router.post('/webhooks/trigger-rto-sim', async (req: Request, res: Response) => {
  if (!SIMULATION_MODE_ENABLED) {
    return simulatorDisabledResponse(req, res);
  }

  try {
    const { orderId } = req.query;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId required' });
    }

    console.log(`🧪 Manual RTO simulation trigger for order ${orderId}`);
    const simulation = await rtoService.dispatchRTOCallSimulation(orderId as string);

    res.status(200).json({
      message: 'RTO simulation room ready',
      provider: 'livekit-simulation',
      orderId,
      roomName: simulation.roomName,
      dispatchId: simulation.dispatchId,
      livekitUrl: simulation.livekitUrl,
      meetUrl: simulation.meetUrl,
      participantIdentity: simulation.participantIdentity,
      participantToken: simulation.participantToken,
      joinSteps: [
        'Open https://meet.livekit.io',
        'Paste LIVEKIT_URL from response',
        'Paste participantToken from response',
        'Join room and speak to the agent',
      ],
    });
  } catch (error) {
    console.error('Error triggering RTO simulation:', error);
    res.status(500).json({ error: 'Failed to create RTO simulation room' });
  }
});

/**
 * Health check endpoint
 */
router.get('/webhooks/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
