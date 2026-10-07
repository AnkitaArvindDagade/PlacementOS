import { MongoClient } from 'mongodb';

export async function getDb() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  if (!globalThis._mongo) globalThis._mongo = new MongoClient(process.env.MONGODB_URI).connect();
  return (await globalThis._mongo).db(process.env.MONGODB_DB || 'placement');
}
