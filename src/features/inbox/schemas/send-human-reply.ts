import * as z from 'zod';

/** Mirrors the DB's existing content length limit for `messages.content`. */
export const MESSAGE_MIN_LENGTH = 1;
export const MESSAGE_MAX_LENGTH = 4000;

/**
 * `conversationId` and `clientMessageId` are both real Postgres `uuid`
 * columns — validating the shape here turns a malformed id into a
 * friendly Zod error instead of a raw Postgres "invalid input syntax
 * for type uuid" error reaching the client.
 */
export const sendHumanReplySchema = z.object({
  conversationId: z.string().uuid('Invalid conversation.'),
  clientMessageId: z.string().uuid('Invalid message id.'),
  content: z
    .string()
    .trim()
    .min(MESSAGE_MIN_LENGTH, 'Enter a message before sending.')
    .max(MESSAGE_MAX_LENGTH, `Keep replies under ${MESSAGE_MAX_LENGTH} characters.`)
});

export type SendHumanReplyInput = z.infer<typeof sendHumanReplySchema>;
