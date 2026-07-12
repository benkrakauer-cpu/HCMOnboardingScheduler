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

// Seed sample meeting templates. Room left blank and attendee lists empty for
// the user to populate. Optionality is conveyed in the title text only.
const SEED_TEMPLATES: { title: string; defaultDurationMinutes: number }[] = [
  { title: 'Security Orientation - In Person', defaultDurationMinutes: 60 },
  { title: 'HCM Orientation - Virtual', defaultDurationMinutes: 60 },
  { title: 'IT Orientation - In Person', defaultDurationMinutes: 60 },
  { title: 'Supervisor Meet and Greet - Optional', defaultDurationMinutes: 30 },
  { title: 'Lunch Break', defaultDurationMinutes: 60 },
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

  // Put an item unless it already exists (idempotent re-seed).
  async function seedItem(pk: string, id: string, item: Record<string, unknown>): Promise<boolean> {
    try {
      await doc.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: { pk, sk: id, id, ...item },
          // Do not clobber an item the operator already created/edited.
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
      return true;
    } catch (err: unknown) {
      const errName = (err as { name?: string })?.name;
      if (errName !== 'ConditionalCheckFailedException') throw err;
      return false; // already present — leave it as-is
    }
  }

  let roomsSeeded = 0;
  for (const name of SEED_ROOMS) {
    if (await seedItem(PK.ROOM, slug(name), { name })) roomsSeeded += 1;
  }

  let templatesSeeded = 0;
  for (const t of SEED_TEMPLATES) {
    const seededOk = await seedItem(PK.TEMPLATE, slug(t.title), {
      title: t.title,
      defaultDurationMinutes: t.defaultDurationMinutes,
      defaultRoom: '',
      requiredAttendeeIds: [],
      optionalAttendeeIds: [],
      notes: '',
    });
    if (seededOk) templatesSeeded += 1;
  }

  return {
    PhysicalResourceId: physicalResourceId,
    Data: { RoomsSeeded: roomsSeeded, TemplatesSeeded: templatesSeeded },
  };
}
