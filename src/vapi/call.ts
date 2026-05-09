import type { ShopifyOrderContext } from '../shopify/types.js';

export interface VapiDispatchResult {
  provider: 'vapi';
  orderId: string;
  customerPhone: string;
  callId: string;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function toE164(phone: string): string {
  const normalized = phone.replace(/[\s()-]/g, '');

  if (!normalized) {
    throw new Error('Customer phone is empty');
  }

  if (normalized.startsWith('+')) {
    return normalized;
  }

  if (/^91\d{10}$/.test(normalized)) {
    return `+${normalized}`;
  }

  if (/^\d{10}$/.test(normalized)) {
    return `+91${normalized}`;
  }

  throw new Error(`Customer phone is not in a supported format: ${phone}`);
}

export async function dispatchVapiCall(orderContext: ShopifyOrderContext): Promise<VapiDispatchResult> {
  const apiKey = getRequiredEnv('VAPI_PRIVATE_KEY');
  const phoneNumberId = getRequiredEnv('VAPI_PHONE_NUMBER_ID');
  const assistantId = getRequiredEnv('VAPI_ASSISTANT_ID');
  const customerPhone = toE164(orderContext.customerPhone);

  const response = await fetch('https://api.vapi.ai/call', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      assistantId,
      phoneNumberId,
      customer: {
        number: customerPhone,
        name: orderContext.customerName,
      },
      name: `RTO ${orderContext.orderName}`,
      metadata: {
        source: 'shopify-rto',
        orderId: orderContext.orderId,
        orderName: orderContext.orderName,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Vapi call creation failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as { id?: string };
  if (!payload.id) {
    throw new Error('Vapi did not return a call id');
  }

  return {
    provider: 'vapi',
    orderId: orderContext.orderId,
    customerPhone,
    callId: payload.id,
  };
}