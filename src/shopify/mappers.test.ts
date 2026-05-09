import test from 'node:test';
import assert from 'node:assert/strict';
import { mapShopifyOrderToContext, normalizeOrderId } from './mappers.js';
import type { RTOAttempt } from './types.js';

test('normalizeOrderId returns the trailing segment for gid-like IDs', () => {
  assert.equal(normalizeOrderId('gid://shopify/Order/123456'), '123456');
  assert.equal(normalizeOrderId('123456'), '123456');
});

test('mapShopifyOrderToContext maps Shopify order fields into domain context', () => {
  const attempts: RTOAttempt[] = [
    {
      timestamp: '2026-05-09T10:00:00.000Z',
      reason: 'Customer was unavailable',
      language: 'hi-IN',
      agentId: 'agent-1',
      callDurationSeconds: 42,
      status: 'completed',
    },
  ];

  const result = mapShopifyOrderToContext(
    {
      id: 101,
      name: '#101',
      customer: {
        id: 202,
        first_name: 'Asha',
        last_name: 'Patel',
        phone: '+910000000000',
        email: 'asha@example.com',
      },
      shipping_address: {
        address1: '12 MG Road',
        city: 'Ahmedabad',
        province: 'Gujarat',
        zip: '380001',
      },
      created_at: '2026-05-08T10:00:00.000Z',
      updated_at: '2026-05-09T10:00:00.000Z',
    },
    attempts,
    'gu-IN'
  );

  assert.deepEqual(result, {
    orderId: '101',
    orderName: '#101',
    customerId: '202',
    customerName: 'Asha Patel',
    customerPhone: '+910000000000',
    customerEmail: 'asha@example.com',
    address: {
      line1: '12 MG Road',
      line2: undefined,
      city: 'Ahmedabad',
      state: 'Gujarat',
      postalCode: '380001',
    },
    language: 'gu-IN',
    previousAttempts: attempts,
    attemptNumber: 2,
    failureReason: 'Customer was unavailable',
    createdAt: '2026-05-08T10:00:00.000Z',
    updatedAt: '2026-05-09T10:00:00.000Z',
  });
});