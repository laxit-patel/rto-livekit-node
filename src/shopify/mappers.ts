import type { RTOAttempt, ShopifyOrderContext } from './types.js';

type ShopifyAddress = {
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  phone?: string;
};

type ShopifyCustomer = {
  id: string | number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
};

type ShopifyOrder = {
  id: string | number;
  name: string;
  customer: ShopifyCustomer;
  shipping_address?: ShopifyAddress;
  billing_address?: ShopifyAddress;
  created_at: string;
  updated_at: string;
};

export function normalizeOrderId(orderId: string): string {
  return orderId.split('/').pop() || orderId;
}

export function mapShopifyOrderToContext(
  order: ShopifyOrder,
  attempts: RTOAttempt[],
  defaultLanguage: ShopifyOrderContext['language'] = 'hi-IN'
): ShopifyOrderContext {
  const address = order.shipping_address || order.billing_address;
  const firstName = order.customer.first_name?.trim() || '';
  const lastName = order.customer.last_name?.trim() || '';
  const fullName = `${firstName} ${lastName}`.trim() || 'Customer';

  return {
    orderId: String(order.id),
    orderName: order.name,
    customerId: String(order.customer.id),
    customerName: fullName,
    customerPhone: order.customer.phone || order.billing_address?.phone || '',
    customerEmail: order.customer.email || '',
    address: {
      line1: address?.address1 || '',
      line2: address?.address2,
      city: address?.city || '',
      state: address?.province || '',
      postalCode: address?.zip || '',
    },
    language: defaultLanguage,
    previousAttempts: attempts,
    attemptNumber: attempts.length + 1,
    failureReason: attempts[attempts.length - 1]?.reason,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}