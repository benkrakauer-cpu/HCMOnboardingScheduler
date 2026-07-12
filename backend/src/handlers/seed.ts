import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { PK } from '../lib/types';

const TABLE_NAME = process.env.TABLE_NAME!;
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Seed rooms, alphabetical (per spec).
const SEED_ROOMS = [
  'Conference Room 1A',
  'Conference Room 3A',
  'Conference Room 3B',
  'Conference Room 3C',
  'Executive Conference Room',
  'North Conference Room',
  'Press Briefing Room',
  'Situation Room',
  'South Conference Room',
  'Training Room',
];

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

interface CfnEvent {
  RequestType: 'Create' | 'Update' | 'Delete';
  PhysicalResourceId?: string;
}

export async function handler(event: CfnEvent) {
  const physicalResourceId = event.PhysicalResourceId ?? 'onboarding-seed-rooms';

  // Nothing to clean up on delete — data is retained.
  if (event.RequestType === 'Delete') {
    return { PhysicalResourceId: physicalResourceId };
  }

  let seeded = 0;
  for (const name of SEED_ROOMS) {
    const id = slug(name);
    try {
      await doc.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: { pk: PK.ROOM, sk: id, id, name },
          // Do not clobber a room the operator already created/renamed.
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
      seeded += 1;
    } catch (err: unknown) {
      const name2 = (err as { name?: string })?.name;
      if (name2 !== 'ConditionalCheckFailedException') throw err;
      // Room already present — leave it as-is.
    }
  }

  return {
    PhysicalResourceId: physicalResourceId,
    Data: { RoomsSeeded: seeded },
  };
}
