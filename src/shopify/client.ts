import type { ShopifyOrderContext, RTOAttempt, RTOMetafield } from './types.js';

class ShopifyClient {
  private shopName: string;
  private accessToken: string;
  private apiVersion = '2026-01';

  constructor() {
    const shopName = process.env.SHOPIFY_SHOP_NAME;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!shopName || !accessToken) {
      throw new Error('Missing Shopify credentials: SHOPIFY_SHOP_NAME and SHOPIFY_ACCESS_TOKEN required');
    }

    this.shopName = shopName;
    this.accessToken = accessToken;
  }

  /**
   * Make HTTP request to Shopify API
   */
  private async request(method: string, path: string, body?: any): Promise<any> {
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
      // Fetch order
      const orderRes = await this.request('GET', `/orders/${orderId}.json`);
      const order = orderRes.order;

      // Extract address
      const address = order.shipping_address || order.billing_address;

      // Fetch existing metafield data
      const cleanOrderId = orderId.split('/').pop() || orderId;
      const attempts = await this.getMetafield(cleanOrderId, 'attempts');
      const attemptsList: RTOAttempt[] = attempts ? JSON.parse(attempts) : [];

      return {
        orderId: order.id.toString(),
        orderName: order.name,
        customerId: order.customer.id.toString(),
        customerName: order.customer.first_name + ' ' + order.customer.last_name,
        customerPhone: order.customer.phone || order.billing_address?.phone || '',
        customerEmail: order.customer.email,
        address: {
          line1: address?.address1 || '',
          line2: address?.address2,
          city: address?.city || '',
          state: address?.province || '',
          postalCode: address?.zip || '',
        },
        language: (process.env.DEFAULT_LANGUAGE as any) || 'hi-IN',
        previousAttempts: attemptsList,
        attemptNumber: attemptsList.length + 1,
        failureReason: attemptsList[attemptsList.length - 1]?.reason,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
      };
    } catch (error) {
      console.error('Error fetching order from Shopify:', error);
      throw error;
    }
  }

  /**
   * Store RTO attempt metadata
   */
  async recordRTOAttempt(
    orderId: string,
    attempt: RTOAttempt
  ): Promise<void> {
    try {
      const cleanOrderId = orderId.split('/').pop() || orderId;
      // Get existing attempts
      const existingData = await this.getMetafield(cleanOrderId, 'attempts');
      const attempts: RTOAttempt[] = existingData ? JSON.parse(existingData) : [];

      // Add new attempt
      attempts.push(attempt);

      // Store back to Shopify
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
      const cleanOrderId = orderId.split('/').pop() || orderId;
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
      const cleanOrderId = orderId.split('/').pop() || orderId;
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
