import { Queue } from "bullmq";
import { QUEUES } from "@apply4you/shared";
import { createRedisConnection } from "./redis.js";

const connection = createRedisConnection();

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
