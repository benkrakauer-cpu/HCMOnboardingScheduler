import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Content-Type': 'application/json',
};

export function json(
  statusCode: number,
  body: unknown,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

export const ok = (body: unknown) => json(200, body);
export const created = (body: unknown) => json(201, body);
export const noContent = (): APIGatewayProxyStructuredResultV2 => ({
  statusCode: 204,
  headers: CORS_HEADERS,
  body: '',
});
export const badRequest = (message: string) => json(400, { error: message });
export const unauthorized = (message = 'Unauthorized') =>
  json(401, { error: message });
export const notFound = (message = 'Not found') => json(404, { error: message });
export const serverError = (message = 'Internal server error') =>
  json(500, { error: message });
