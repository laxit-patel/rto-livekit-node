import { shopifyClient } from './client.js';
import { dispatchRTOAgent, dispatchRTOAgentSimulation, type RTOSimulationResult } from '../livekit/dispatch.js';
import { dispatchVapiCall } from '../vapi/call.js';
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

  async dispatchRTOCall(orderId: string): Promise<OutboundCallResult> {
    const orderContext = await this.getOrderContext(orderId);
    const provider = (process.env.OUTBOUND_CALL_PROVIDER || 'vapi').trim().toLowerCase();

    if (provider === 'livekit') {
      const livekitDispatch = await dispatchRTOAgent(orderContext);
      return {
        provider: 'livekit',
        orderId: livekitDispatch.orderId,
        customerPhone: livekitDispatch.customerPhone,
        dispatchId: livekitDispatch.dispatchId,
        roomName: livekitDispatch.roomName,
      };
    }

    return dispatchVapiCall(orderContext);
  }

  async dispatchRTOCallSimulation(orderId: string): Promise<RTOSimulationResult> {
    const orderContext = await this.getOrderContext(orderId);
    return dispatchRTOAgentSimulation(orderContext);
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

export type OutboundCallResult =
  | {
      provider: 'livekit';
      orderId: string;
      customerPhone: string;
      dispatchId: string;
      roomName: string;
    }
  | {
      provider: 'vapi';
      orderId: string;
      customerPhone: string;
      callId: string;
    };

export const rtoService = new RTOService();