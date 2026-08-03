import { Queue } from "bullmq";
import { QUEUES } from "@apply4you/shared";
import { createRedisConnection } from "./redis.js";

/**
 * Producers (Queue) may share one connection — their commands are short and
 * non-blocking.
 *
 * Workers may NOT. A BullMQ Worker waits for jobs with a blocking Redis command,
 * and ioredis serialises commands on a connection, so a queue that always has
 * work monopolises a shared socket and starves every other worker behind it.
 * Observed live: the embedding queue (2.5k backlog) ran flat out while `resolve`
 * sat at active=0 with 10 jobs waiting and a worker attached. The same
 * starvation hits `submit`, which would leave approved applications silently
 * unsent for as long as any backlog exists.
 *
 * So every Worker gets its own connection via workerConnection().
 */
const connection = createRedisConnection();

export const workerConnection = createRedisConnection;

export const queues = {
  sourcing: new Queue(QUEUES.sourcing, { connection }),
  embedding: new Queue(QUEUES.embedding, { connection }),
  profileEmbedding: new Queue(QUEUES.profileEmbedding, { connection }),
  matching: new Queue(QUEUES.matching, { connection }),
  resolve: new Queue(QUEUES.resolve, { connection }),
  submitGreenhouse: new Queue(QUEUES.submitGreenhouse, { connection }),
  submitLever: new Queue(QUEUES.submitLever, { connection }),
  submitAshby: new Queue(QUEUES.submitAshby, { connection }),
  submitWorkable: new Queue(QUEUES.submitWorkable, { connection }),
} as const;

export { connection };
