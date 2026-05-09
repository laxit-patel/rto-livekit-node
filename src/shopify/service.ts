import { shopifyClient } from './client.js';
import { dispatchRTOAgent, type RTODispatchResult } from '../livekit/dispatch.js';
import type { RTOAttempt, ShopifyOrderContext } from './types.js';

declare global {
  var rtoQueue: Array<{ timestamp: string; orderContext: ShopifyOrderContext }>;
}

class RTOService {
  async getOrderContext(orderId: string): Promise<ShopifyOrderContext> {
    return shopifyClient.getOrder(orderId);
  }

  async queueRTOJob(orderId: string): Promise<ShopifyOrderContext> {
    const orderContext = await this.getOrderContext(orderId);

    globalThis.rtoQueue = globalThis.rtoQueue || [];
    globalThis.rtoQueue.push({
      timestamp: new Date().toISOString(),
      orderContext,
    });

    console.log('✓ RTO job queued:', {
      orderId,
      customerName: orderContext.customerName,
      attemptNumber: orderContext.attemptNumber,
      language: orderContext.language,
    });

    return orderContext;
  }

  async dispatchRTOCall(orderId: string): Promise<RTODispatchResult> {
    const orderContext = await this.getOrderContext(orderId);
    return dispatchRTOAgent(orderContext);
  }

  async recordAttempt(orderId: string, attempt: RTOAttempt): Promise<void> {
    await shopifyClient.recordRTOAttempt(orderId, attempt);
  }

  async scheduleRedelivery(orderId: string, redeliveryDate: string): Promise<void> {
    await shopifyClient.scheduleRedelivery(orderId, redeliveryDate);
  }

  async addOrderNote(orderId: string, note: string): Promise<void> {
    await shopifyClient.addOrderNote(orderId, note);
  }
}

export const rtoService = new RTOService();