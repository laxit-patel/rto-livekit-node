import { mapShopifyOrderToContext, normalizeOrderId } from './mappers.js';
import type { ShopifyOrderContext, ShopifyOrderSummary, RTOAttempt } from './types.js';

class ShopifyClient {
  private shopName: string;
  private accessToken: string | null;
  private apiVersion = '2026-01';

  constructor() {
    this.shopName = process.env.SHOPIFY_SHOP_NAME || '';
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN?.trim() || null;

    if (!this.shopName) {
      throw new Error('Missing Shopify credentials: SHOPIFY_SHOP_NAME required');
    }
  }

  /**
   * Make HTTP request to Shopify API
   */
  private async request(method: string, path: string, body?: any): Promise<any> {
    if (!this.accessToken) {
      throw new Error('Missing Shopify credentials: SHOPIFY_ACCESS_TOKEN required for Shopify API calls');
    }

    const url = `https://${this.shopName}/admin/api/${this.apiVersion}${path}`;
    
    const response = await fetch(url, {
      method,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Fetch order by ID with customer and fulfillment data
   */
  async getOrder(orderId: string): Promise<ShopifyOrderContext> {
    try {
      const orderRes = await this.request('GET', `/orders/${orderId}.json`);
      const order = orderRes.order;

      const cleanOrderId = normalizeOrderId(orderId);
      const attempts = await this.getMetafield(cleanOrderId, 'attempts');
      const attemptsList: RTOAttempt[] = attempts ? JSON.parse(attempts) : [];

      return mapShopifyOrderToContext(
        order,
        attemptsList,
        (process.env.DEFAULT_LANGUAGE as ShopifyOrderContext['language']) || 'hi-IN'
      );
    } catch (error) {
      console.error('Error fetching order from Shopify:', error);
      throw error;
    }
  }

  /**
   * List recent orders for simulation UI.
   */
  async listRecentOrders(limit: number = 20): Promise<ShopifyOrderSummary[]> {
    const boundedLimit = Math.max(1, Math.min(limit, 50));
    const res = await this.request(
      'GET',
      `/orders.json?status=any&limit=${boundedLimit}&fields=id,name,created_at,customer,billing_address,shipping_address`
    );

    const orders = (res.orders || []) as Array<{
      id: string | number;
      name?: string;
      created_at?: string;
      customer?: {
        first_name?: string;
        last_name?: string;
        phone?: string;
      };
      billing_address?: {
        phone?: string;
      };
      shipping_address?: {
        phone?: string;
      };
    }>;

    return orders.map((order) => {
      const firstName = order.customer?.first_name?.trim() || '';
      const lastName = order.customer?.last_name?.trim() || '';
      const customerName = `${firstName} ${lastName}`.trim() || 'Customer';

      return {
        orderId: String(order.id),
        orderName: order.name || String(order.id),
        customerName,
        customerPhone:
          order.customer?.phone || order.shipping_address?.phone || order.billing_address?.phone || '',
        createdAt: order.created_at || new Date().toISOString(),
      };
    });
  }

  /**
   * Store RTO attempt metadata
   */
  async recordRTOAttempt(
    orderId: string,
    attempt: RTOAttempt
  ): Promise<void> {
    try {
      const cleanOrderId = normalizeOrderId(orderId);
      const existingData = await this.getMetafield(cleanOrderId, 'attempts');
      const attempts: RTOAttempt[] = existingData ? JSON.parse(existingData) : [];
      attempts.push(attempt);
      await this.setMetafield(cleanOrderId, 'attempts', JSON.stringify(attempts), 'json');

      console.log(`✓ RTO attempt recorded for order ${cleanOrderId}`);
    } catch (error) {
      console.error('Error recording RTO attempt:', error);
      throw error;
    }
  }

  /**
   * Schedule redelivery date
   */
  async scheduleRedelivery(orderId: string, redeliveryDate: string): Promise<void> {
    try {
      const cleanOrderId = normalizeOrderId(orderId);
      await this.setMetafield(cleanOrderId, 'redeliveryScheduled', redeliveryDate, 'string');

      console.log(`✓ Redelivery scheduled for order ${cleanOrderId} on ${redeliveryDate}`);
    } catch (error) {
      console.error('Error scheduling redelivery:', error);
      // Non-blocking error
    }
  }

  /**
   * Add order note (appears in Shopify admin)
   */
  async addOrderNote(orderId: string, note: string): Promise<void> {
    try {
      const cleanOrderId = normalizeOrderId(orderId);
      await this.request('POST', `/orders/${cleanOrderId}/notes.json`, { note });

      console.log(`✓ Note added to order ${cleanOrderId}`);
    } catch (error) {
      console.error('Error adding order note:', error);
      // Non-blocking error
    }
  }

  /**
   * Get metafield value
   */
  private async getMetafield(orderId: string, key: string): Promise<string | null> {
    try {
      const res = await this.request(
        'GET',
        `/orders/${orderId}/metafields.json?namespace=rto&key=${key}`
      );

      const metafields = res.metafields || [];
      return metafields.length > 0 ? metafields[0].value : null;
    } catch (error) {
      console.warn(`Metafield ${key} not found`);
      return null;
    }
  }

  /**
   * Set metafield value
   */
  private async setMetafield(
    orderId: string,
    key: string,
    value: string,
    type: 'json' | 'string' = 'string'
  ): Promise<void> {
    try {
      await this.request('POST', `/orders/${orderId}/metafields.json`, {
        metafield: {
          namespace: 'rto',
          key,
          value,
          type,
        },
      });
    } catch (error) {
      console.error(`Error setting metafield ${key}:`, error);
      throw error;
    }
  }
}

export const shopifyClient = new ShopifyClient();
