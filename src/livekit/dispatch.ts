import { AccessToken, AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import { normalizeOrderId } from '../shopify/mappers.js';
import type { ShopifyOrderContext } from '../shopify/types.js';

export const LIVEKIT_AGENT_NAME = process.env.LIVEKIT_AGENT_NAME?.trim() || 'rto-recovery-agent';

function getSimulationTokenTtl(): string {
  return process.env.LIVEKIT_SIM_TOKEN_TTL?.trim() || '24h';
}

function getRoomEmptyTimeoutSeconds(): number {
  const raw = process.env.LIVEKIT_ROOM_EMPTY_TIMEOUT_SECONDS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return 60 * 30;
}

export interface RTODispatchResult {
  dispatchId: string;
  roomName: string;
  customerPhone: string;
  orderId: string;
}

export interface RTOSimulationResult extends RTODispatchResult {
  participantIdentity: string;
  participantToken: string;
  livekitUrl: string;
  meetUrl: string;
}

function getLiveKitApiHost(): string {
  const livekitUrl = process.env.LIVEKIT_URL?.trim();

  if (!livekitUrl) {
    throw new Error('Missing LiveKit configuration: LIVEKIT_URL required');
  }

  if (livekitUrl.startsWith('wss://')) {
    return livekitUrl.replace('wss://', 'https://');
  }

  if (livekitUrl.startsWith('ws://')) {
    return livekitUrl.replace('ws://', 'http://');
  }

  return livekitUrl;
}

function getLiveKitCredentials(): { apiKey: string; apiSecret: string; host: string } {
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

  if (!apiKey || !apiSecret) {
    throw new Error('Missing LiveKit configuration: LIVEKIT_API_KEY and LIVEKIT_API_SECRET required');
  }

  return {
    apiKey,
    apiSecret,
    host: getLiveKitApiHost(),
  };
}

function buildRoomName(orderId: string): string {
  return `rto-${normalizeOrderId(orderId)}-${Date.now()}`;
}

function buildParticipantIdentity(orderId: string): string {
  return `sim-caller-${normalizeOrderId(orderId)}-${Date.now()}`;
}

export async function dispatchRTOAgent(orderContext: ShopifyOrderContext): Promise<RTODispatchResult> {
  const { apiKey, apiSecret, host } = getLiveKitCredentials();
  const roomServiceClient = new RoomServiceClient(host, apiKey, apiSecret);
  const agentDispatchClient = new AgentDispatchClient(host, apiKey, apiSecret);
  const roomName = buildRoomName(orderContext.orderId);

  await roomServiceClient.createRoom({
    name: roomName,
    emptyTimeout: getRoomEmptyTimeoutSeconds(),
    maxParticipants: 2,
    metadata: JSON.stringify({
      source: 'shopify-rto',
      orderId: orderContext.orderId,
      customerPhone: orderContext.customerPhone,
    }),
  });

  const dispatch = await agentDispatchClient.createDispatch(roomName, LIVEKIT_AGENT_NAME, {
    metadata: JSON.stringify({
      orderId: orderContext.orderId,
      customerPhone: orderContext.customerPhone,
    }),
  });

  return {
    dispatchId: dispatch.id,
    roomName,
    customerPhone: orderContext.customerPhone,
    orderId: orderContext.orderId,
  };
}

export async function dispatchRTOAgentSimulation(
  orderContext: ShopifyOrderContext
): Promise<RTOSimulationResult> {
  const dispatch = await dispatchRTOAgent(orderContext);
  const { apiKey, apiSecret } = getLiveKitCredentials();
  const participantIdentity = buildParticipantIdentity(orderContext.orderId);

  const token = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    name: `${orderContext.customerName} (Sim)`,
    ttl: getSimulationTokenTtl(),
  });

  token.addGrant({
    roomJoin: true,
    room: dispatch.roomName,
    canPublish: true,
    canSubscribe: true,
  });

  return {
    ...dispatch,
    participantIdentity,
    participantToken: await token.toJwt(),
    livekitUrl: process.env.LIVEKIT_URL?.trim() || '',
    meetUrl: 'https://meet.livekit.io',
  };
}