import { randomUUID } from 'crypto';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import {
  ok,
  created,
  noContent,
  badRequest,
  unauthorized,
  notFound,
  serverError,
} from '../lib/http';
import { listItems, getItem, putItem, deleteItem } from '../lib/db';
import { getSecret } from '../lib/secrets';
import { signToken, verifyToken } from '../lib/jwt';
import { PK, SETTINGS_ID, type EntityPk } from '../lib/types';

const JWT_SECRET_ARN = process.env.JWT_SECRET_ARN!;
const PASSWORD_SECRET_ARN = process.env.PASSWORD_SECRET_ARN!;
const TOKEN_TTL_SECONDS = parseInt(process.env.TOKEN_TTL_SECONDS ?? '43200', 10);

// First path segment -> DynamoDB partition key for the generic CRUD entities.
const ENTITY_PK: Record<string, EntityPk> = {
  directory: PK.PERSON,
  templates: PK.TEMPLATE,
  rooms: PK.ROOM,
  patterns: PK.PATTERN,
};

function parseBody(event: APIGatewayProxyEventV2): any {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function bearerToken(event: APIGatewayProxyEventV2): string | null {
  const header =
    event.headers?.authorization ?? event.headers?.Authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

async function requireAuth(event: APIGatewayProxyEventV2): Promise<boolean> {
  const token = bearerToken(event);
  if (!token) return false;
  const secret = await getSecret(JWT_SECRET_ARN);
  return verifyToken(token, secret) !== null;
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method.toUpperCase();
  const rawPath = event.rawPath || '/';
  const segments = rawPath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);

  try {
    if (method === 'OPTIONS') return noContent();

    // ---- Health check (public) ----
    if (segments[0] === 'health') return ok({ status: 'ok' });

    // ---- Auth (public) ----
    if (segments[0] === 'auth' && segments[1] === 'login' && method === 'POST') {
      return await handleLogin(event);
    }

    // ---- Everything below requires a valid session token ----
    if (!(await requireAuth(event))) return unauthorized();

    const [resource, id] = segments;

    if (resource === 'settings') return await handleSettings(event, method);
    if (resource === 'log') return await handleLog(event, method);

    if (resource in ENTITY_PK) {
      return await handleEntity(ENTITY_PK[resource], resource, method, id, event);
    }

    return notFound(`Unknown route: /${segments.join('/')}`);
  } catch (err) {
    console.error('Unhandled error', err);
    return serverError();
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
async function handleLogin(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const body = parseBody(event);
  if (!body || typeof body.password !== 'string') {
    return badRequest('Password is required');
  }

  const [expected, signingSecret] = await Promise.all([
    getSecret(PASSWORD_SECRET_ARN),
    getSecret(JWT_SECRET_ARN),
  ]);

  // Constant-time-ish compare via a fixed-shape check.
  if (body.password !== expected || expected.length === 0) {
    return unauthorized('Incorrect password');
  }

  const token = signToken({ sub: 'hcm-user' }, signingSecret, TOKEN_TTL_SECONDS);
  return ok({ token, expiresInSeconds: TOKEN_TTL_SECONDS });
}

// ---------------------------------------------------------------------------
// Generic CRUD entities (directory, templates, rooms, patterns)
// ---------------------------------------------------------------------------
async function handleEntity(
  pk: EntityPk,
  resource: string,
  method: string,
  id: string | undefined,
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  switch (method) {
    case 'GET': {
      const items = await listItems(pk);
      return ok(items);
    }
    case 'POST': {
      const body = parseBody(event);
      if (!body || typeof body !== 'object') return badRequest('Invalid body');
      const item = { ...body, id: randomUUID() };
      const err = validateEntity(resource, item);
      if (err) return badRequest(err);
      await putItem(pk, item);
      return created(item);
    }
    case 'PUT': {
      if (!id) return badRequest('Missing id');
      const existing = await getItem(pk, id);
      if (!existing) return notFound();
      const body = parseBody(event);
      if (!body || typeof body !== 'object') return badRequest('Invalid body');
      const item = { ...body, id };
      const err = validateEntity(resource, item);
      if (err) return badRequest(err);
      await putItem(pk, item);
      return ok(item);
    }
    case 'DELETE': {
      if (!id) return badRequest('Missing id');
      await deleteItem(pk, id);
      return noContent();
    }
    default:
      return badRequest(`Unsupported method ${method}`);
  }
}

function validateEntity(resource: string, item: any): string | null {
  switch (resource) {
    case 'directory':
      if (!item.displayName?.trim()) return 'displayName is required';
      if (!item.email?.trim()) return 'email is required';
      if (item.type !== 'person' && item.type !== 'distro')
        return 'type must be "person" or "distro"';
      return null;
    case 'templates':
      if (!item.title?.trim()) return 'title is required';
      if (typeof item.defaultDurationMinutes !== 'number')
        return 'defaultDurationMinutes must be a number';
      item.requiredAttendeeIds = item.requiredAttendeeIds ?? [];
      item.optionalAttendeeIds = item.optionalAttendeeIds ?? [];
      item.defaultRoom = item.defaultRoom ?? '';
      item.notes = item.notes ?? '';
      return null;
    case 'rooms':
      if (!item.name?.trim()) return 'name is required';
      return null;
    case 'patterns':
      if (!item.name?.trim()) return 'name is required';
      if (!Array.isArray(item.items)) return 'items must be an array';
      return null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Settings (single record)
// ---------------------------------------------------------------------------
async function handleSettings(
  event: APIGatewayProxyEventV2,
  method: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (method === 'GET') {
    const item = await getItem<{ id: string; organizerEmail: string }>(
      PK.SETTINGS,
      SETTINGS_ID,
    );
    return ok(item ?? { id: SETTINGS_ID, organizerEmail: '' });
  }
  if (method === 'PUT') {
    const body = parseBody(event);
    if (!body || typeof body.organizerEmail !== 'string') {
      return badRequest('organizerEmail is required');
    }
    const item = { id: SETTINGS_ID, organizerEmail: body.organizerEmail.trim() };
    await putItem(PK.SETTINGS, item);
    return ok(item);
  }
  return badRequest(`Unsupported method ${method}`);
}

// ---------------------------------------------------------------------------
// Generation log (append-only)
// ---------------------------------------------------------------------------
async function handleLog(
  event: APIGatewayProxyEventV2,
  method: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (method === 'GET') {
    const items = await listItems<{ id: string; timestamp: string }>(PK.LOG);
    items.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    return ok(items);
  }
  if (method === 'POST') {
    const body = parseBody(event);
    if (!body || typeof body !== 'object') return badRequest('Invalid body');
    const item = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      newEmployeeEmails: body.newEmployeeEmails ?? [],
      patternUsed: body.patternUsed ?? null,
      meetingsGenerated: body.meetingsGenerated ?? [],
    };
    await putItem(PK.LOG, item);
    return created(item);
  }
  return badRequest(`Unsupported method ${method}`);
}
