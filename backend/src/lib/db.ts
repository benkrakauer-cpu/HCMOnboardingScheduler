import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.TABLE_NAME!;

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

/** Strip the internal pk/sk keys from a stored item before returning it. */
function clean<T extends Record<string, unknown>>(item: T): Omit<T, 'pk' | 'sk'> {
  const { pk, sk, ...rest } = item as Record<string, unknown>;
  return rest as Omit<T, 'pk' | 'sk'>;
}

export async function listItems<T extends { id: string }>(pk: string): Promise<T[]> {
  const out = await doc.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': pk },
    }),
  );
  return (out.Items ?? []).map((i) => clean(i as Record<string, unknown>) as unknown as T);
}

export async function getItem<T extends { id: string }>(
  pk: string,
  id: string,
): Promise<T | null> {
  const out = await doc.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { pk, sk: id } }),
  );
  return out.Item ? (clean(out.Item as Record<string, unknown>) as unknown as T) : null;
}

export async function putItem<T extends { id: string }>(pk: string, item: T): Promise<T> {
  await doc.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { pk, sk: item.id, ...item },
    }),
  );
  return item;
}

export async function deleteItem(pk: string, id: string): Promise<void> {
  await doc.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { pk, sk: id } }));
}
