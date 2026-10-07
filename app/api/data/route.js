import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getDb } from '../../../lib/mongo';
import { SEED } from '../../../lib/seed';
import { requireAuth } from '../../../lib/auth';

export const dynamic = 'force-dynamic';
const OWNER = 'owner';
const fail = (e) => {
  const invalid = e.message?.startsWith('Enter ') || e.message?.startsWith('That ') || e.message?.startsWith('Topic ') || e.message?.startsWith('Company ') || e.message?.startsWith('Study ') || e.message === 'Unknown action.';
  if (!invalid && e.message !== 'Unauthorized') console.error('PlacementOS data API error:', e);
  return NextResponse.json({ error: e.message === 'Unauthorized' ? 'Please sign in again.' : invalid ? e.message : 'Could not complete that request. Please try again.' }, { status: e.message === 'Unauthorized' ? 401 : invalid ? 400 : 500 });
};
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function load(db) {
  const c = (name) => db.collection(name);
  const settingsCollection = c('settings');
  if (!(await settingsCollection.findOne({ _id: 'migration-v1' }))) {
    await Promise.all(['topics', 'companies', 'progress', 'days', 'sessions', 'timer', 'settings'].map((name) => c(name).updateMany({ owner: { $exists: false } }, { $set: { owner: OWNER } })));
    await c('progress').updateMany({ owner: OWNER, companyId: { $exists: false }, colId: { $exists: true, $ne: 'general' } }, [{ $set: { companyId: '$colId' } }]);
    await c('progress').deleteMany({ owner: OWNER, colId: 'general' });
    const legacyDays = await c('days').find({ owner: OWNER, minutes: { $gt: 0 } }).toArray();
    if (legacyDays.length) await c('sessions').insertMany(legacyDays.map((day) => ({ _id: `migration-${day._id}`, owner: OWNER, seconds: day.minutes * 60, startedAt: new Date(`${day._id}T12:00:00+05:30`), endedAt: new Date(`${day._id}T12:00:00+05:30`), companyId: null, companyName: null, topicId: null, topicName: 'Imported study time' })));
    await settingsCollection.insertOne({ _id: 'migration-v1', completedAt: new Date() });
  }
  const existing = await c('topics').find({ owner: OWNER }, { projection: { name: 1, category: 1 } }).toArray();
  const keys = new Set(existing.map((t) => `${t.name.toLocaleLowerCase()}\0${t.category}`));
  let order = existing.length;
  const missing = SEED.flatMap(([category, names]) => names.filter((name) => !keys.has(`${name.toLocaleLowerCase()}\0${category}`)).map((name) => ({ _id: randomUUID(), owner: OWNER, name, category, order: order++ })));
  if (missing.length) await c('topics').insertMany(missing);
  await Promise.all([
    c('topics').createIndex({ owner: 1, order: 1 }), c('companies').createIndex({ owner: 1, order: 1 }),
    c('progress').createIndex({ owner: 1, topicId: 1, companyId: 1 }, { unique: true }),
    c('sessions').createIndex({ owner: 1, startedAt: -1 }), c('timer').createIndex({ owner: 1 }, { unique: true }),
  ]);
  const [topics, companies, progress, sessions, timer, settings, studyDays, companyStudy] = await Promise.all([
    c('topics').find({ owner: OWNER }).sort({ order: 1 }).toArray(), c('companies').find({ owner: OWNER }).sort({ order: 1 }).toArray(),
    c('progress').find({ owner: OWNER }).toArray(), c('sessions').find({ owner: OWNER }).sort({ startedAt: -1 }).limit(100).toArray(),
    c('timer').findOne({ owner: OWNER }), c('settings').findOne({ _id: OWNER }),
    c('sessions').aggregate([{ $match: { owner: OWNER } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt', timezone: 'Asia/Kolkata' } }, seconds: { $sum: '$seconds' } } }, { $sort: { _id: 1 } }]).toArray(),
    c('sessions').aggregate([{ $match: { owner: OWNER, companyId: { $ne: null } } }, { $group: { _id: '$companyId', seconds: { $sum: '$seconds' } } }]).toArray(),
  ]);
  return { topics: topics.map(({ _id, name, category }) => ({ _id, name, category })), companies: companies.map(({ _id, name }) => ({ _id, name })),
    progress: progress.map(({ topicId, companyId }) => `${topicId}:${companyId}`), sessions, studyDays,
    companyStudy: Object.fromEntries(companyStudy.map((item) => [item._id, item.seconds])),
    timer: timer ? { running: timer.running, startedAt: timer.startedAt, elapsedSeconds: timer.elapsedSeconds, createdAt: timer.createdAt, companyId: timer.companyId || null, topicId: timer.topicId || null } : null,
    settings: { dailyGoal: settings?.dailyGoal || 30, theme: settings?.theme || 'light' } };
}

export async function GET() { try { await requireAuth(); return NextResponse.json(await load(await getDb())); } catch (e) { return fail(e); } }

export async function POST(req) {
  try {
    await requireAuth();
    const b = await req.json(); const db = await getDb(); const c = (n) => db.collection(n);
    const name = String(b.name || '').trim();
    switch (b.action) {
      case 'addTopic': {
        if (!name || name.length > 100) throw new Error('Enter a topic name under 100 characters.');
        const category = String(b.category || 'Placement Preparation').trim().slice(0, 60);
        const dup = await c('topics').findOne({ owner: OWNER, name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' }, category });
        if (dup) throw new Error('That topic already exists in this category.');
        await c('topics').insertOne({ _id: randomUUID(), owner: OWNER, name, category, order: Date.now() }); break;
      }
      case 'editTopic': {
        if (!name || name.length > 100) throw new Error('Topic name is required and must be under 100 characters.');
        const category = String(b.category || 'Placement Preparation').trim().slice(0, 60);
        if (await c('topics').findOne({ owner: OWNER, _id: { $ne: b.id }, name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' }, category })) throw new Error('That topic already exists in this category.');
        await c('topics').updateOne({ _id: b.id, owner: OWNER }, { $set: { name, category } }); break;
      }
      case 'removeTopic':
        await Promise.all([c('topics').deleteOne({ _id: b.id, owner: OWNER }), c('progress').deleteMany({ owner: OWNER, topicId: b.id })]); break;
      case 'addCompany':
        if (!name || name.length > 80) throw new Error('Enter a company name under 80 characters.');
        if (await c('companies').findOne({ owner: OWNER, name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } })) throw new Error('That company already exists.');
        await c('companies').insertOne({ _id: randomUUID(), owner: OWNER, name, order: Date.now() }); break;
      case 'editCompany':
        if (!name || name.length > 80) throw new Error('Company name is required and must be under 80 characters.');
        if (await c('companies').findOne({ owner: OWNER, _id: { $ne: b.id }, name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } })) throw new Error('That company already exists.');
        await c('companies').updateOne({ _id: b.id, owner: OWNER }, { $set: { name } }); break;
      case 'removeCompany':
        await Promise.all([c('companies').deleteOne({ _id: b.id, owner: OWNER }), c('progress').deleteMany({ owner: OWNER, companyId: b.id }), c('sessions').updateMany({ owner: OWNER, companyId: b.id }, { $set: { companyId: null } })]); break;
      case 'toggle': {
        const _id = `${b.topicId}:${b.companyId}`;
        if (b.done) await c('progress').updateOne({ _id, owner: OWNER }, { $set: { owner: OWNER, topicId: b.topicId, companyId: b.companyId, completedAt: new Date() } }, { upsert: true });
        else await c('progress').deleteOne({ _id, owner: OWNER }); break;
      }
      case 'saveSession': {
        const seconds = Math.floor(Number(b.seconds));
        if (!Number.isFinite(seconds) || seconds < 1 || seconds > 24 * 3600) throw new Error('Study duration is invalid.');
        const co = b.companyId ? await c('companies').findOne({ _id: b.companyId, owner: OWNER }) : null;
        const tp = b.topicId ? await c('topics').findOne({ _id: b.topicId, owner: OWNER }) : null;
        await c('sessions').insertOne({ _id: randomUUID(), owner: OWNER, seconds, startedAt: new Date(b.startedAt || Date.now() - seconds * 1000), endedAt: new Date(), companyId: co?._id || null, companyName: co?.name || null, topicId: tp?._id || null, topicName: tp?.name || null });
        await c('timer').deleteOne({ owner: OWNER }); break;
      }
      case 'timer':
        if (b.timer) await c('timer').updateOne({ owner: OWNER }, { $set: { running: !!b.timer.running, startedAt: b.timer.startedAt, elapsedSeconds: Number(b.timer.elapsedSeconds) || 0, createdAt: b.timer.createdAt || b.timer.startedAt, companyId: b.timer.companyId || null, topicId: b.timer.topicId || null, owner: OWNER } }, { upsert: true });
        else await c('timer').deleteOne({ owner: OWNER }); break;
      case 'settings':
        await c('settings').updateOne({ _id: OWNER }, { $set: { dailyGoal: Math.min(240, Math.max(5, Number(b.dailyGoal) || 30)), theme: b.theme === 'dark' ? 'dark' : 'light' } }, { upsert: true }); break;
      default: throw new Error('Unknown action.');
    }
    return NextResponse.json(await load(db));
  } catch (e) { return fail(e); }
}
