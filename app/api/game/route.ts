import { getChatGPTUser } from '@/app/chatgpt-auth';
import { database } from '@/lib/database';
import { isWord, randomWord, scoreGuess } from '@/lib/word-engine';
export const dynamic = 'force-dynamic';
class Fault extends Error {
    constructor(message: string, public status = 400) { super(message); }
}
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const now = () => Date.now();
const code = () => crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
type RecordRow = Record<string, any>;
async function player(db: D1Database) { const auth = await getChatGPTUser(); if (!auth)
    return null; await db.prepare('INSERT OR IGNORE INTO players (id,name,code) VALUES (?,?,?)').bind(auth.userId, auth.fullName?.slice(0, 24) || 'Player ' + crypto.randomUUID().slice(0, 4).toUpperCase(), code()).run(); return db.prepare('SELECT id,name,code FROM players WHERE id=?').bind(auth.userId).first<RecordRow>(); }
async function roomFor(db: D1Database, room: string, user: string) { const r = await db.prepare('SELECT r.* FROM rooms r JOIN members m ON m.room=r.code WHERE r.code=? AND m.user=?').bind(room, user).first<RecordRow>(); if (!r)
    throw new Fault('Join this room with its invite code first.', 403); return r; }
async function refreshRoom(db: D1Database, r: RecordRow) { if (r.status === 'playing') {
    await db.prepare("UPDATE rooms SET status='finished' WHERE code=? AND game_id=? AND status='playing' AND NOT EXISTS (SELECT 1 FROM members m LEFT JOIN progress p ON p.user=m.user AND p.game=? WHERE m.room=? AND (p.status IS NULL OR p.status='playing'))").bind(r.code, r.game_id, r.game_id, r.code).run();
    return await db.prepare('SELECT * FROM rooms WHERE code=?').bind(r.code).first<RecordRow>();
} return r; }
async function gameView(db: D1Database, g: RecordRow, user: string) { await db.prepare('INSERT OR IGNORE INTO progress (game,user,started) VALUES (?,?,?)').bind(g.id, user, g.room ? g.started : now()).run(); const p = await db.prepare('SELECT * FROM progress WHERE game=? AND user=?').bind(g.id, user).first<RecordRow>(); return { id: g.id, rows: JSON.parse(p!.rows), status: p!.status, answer: p!.status === 'playing' ? undefined : g.answer }; }
async function dailyGame(db: D1Database) { const day = new Date().toISOString().slice(0, 10); await db.prepare('INSERT OR IGNORE INTO games (id,day,answer,started) VALUES (?,?,?,?)').bind('daily-' + day, day, randomWord(), now()).run(); return (await db.prepare('SELECT * FROM games WHERE day=?').bind(day).first<RecordRow>())!; }
function failure(e: unknown) { if (e instanceof Fault)
    return reply({ error: e.message }, e.status); console.error('Wordmates request failed', e); return reply({ error: 'The game could not connect. Please try again in a moment.' }, 503); }
export async function GET(request: Request) {
    try {
        const auth = await getChatGPTUser();
        if (!auth)
            return reply({ user: null, date: new Date().toISOString().slice(0, 10) });
        const db = database();
        const u = (await player(db))!;
        const rc = new URL(request.url).searchParams.get('room');
        const friends = await db.prepare("SELECT p.id,p.name,(SELECT COUNT(*) FROM progress g WHERE g.user=p.id AND g.status='won') AS wins FROM friendships f JOIN players p ON p.id=CASE WHEN f.a=? THEN f.b ELSE f.a END WHERE (f.a=? OR f.b=?) AND f.accepted=1 ORDER BY p.name").bind(u.id, u.id, u.id).all();
        const requests = await db.prepare('SELECT p.id,p.name FROM friendships f JOIN players p ON p.id=f.requester WHERE (f.a=? OR f.b=?) AND f.requester<>? AND f.accepted=0').bind(u.id, u.id, u.id).all();
        const stats = await db.prepare("SELECT COUNT(*) AS played,COALESCE(SUM(status='won'),0) AS wins FROM progress WHERE user=? AND status<>'playing'").bind(u.id).first();
        const recent = await db.prepare('SELECT r.code,r.status,r.round FROM rooms r JOIN members m ON m.room=r.code WHERE m.user=? ORDER BY r.created DESC LIMIT 5').bind(u.id).all();
        let room = null, daily = null;
        if (rc) {
            let r = await roomFor(db, rc, u.id);
            r = (await refreshRoom(db, r))!;
            const g = r.game_id ? await db.prepare('SELECT * FROM games WHERE id=?').bind(r.game_id).first<RecordRow>() : null;
            const players = await db.prepare("SELECT p.id,p.name,COALESCE(g.status,'waiting') AS status,COALESCE(g.attempts,0) AS attempts,CASE WHEN g.finished IS NOT NULL THEN MAX(0,CAST((g.finished-g.started)/1000 AS INTEGER)) ELSE NULL END AS seconds FROM members m JOIN players p ON p.id=m.user LEFT JOIN progress g ON g.user=m.user AND g.game=? WHERE m.room=? ORDER BY CASE WHEN g.status='won' THEN 0 WHEN g.status='lost' THEN 2 ELSE 1 END,CASE WHEN g.status='won' THEN g.attempts ELSE 0 END, g.finished,p.name").bind(r.game_id, rc).all();
            room = { code: rc, status: r.status, round: r.round, hostId: r.host, players: players.results, game: g ? await gameView(db, g, u.id) : null };
        }
        else {
            daily = await gameView(db, await dailyGame(db), u.id);
        }
        return reply({ user: u, date: new Date().toISOString().slice(0, 10), friends: friends.results, requests: requests.results, stats, rooms: recent.results, room, daily });
    }
    catch (e) {
        return failure(e);
    }
}
export async function POST(request: Request) {
    try {
        const origin = request.headers.get('origin');
        if (origin && origin !== new URL(request.url).origin)
            throw new Fault('Please play from the app itself.', 403);
        if (!request.headers.get('content-type')?.includes('application/json'))
            throw new Fault('Expected a JSON request.');
        if (Number(request.headers.get('content-length') || 0) > 4096)
            throw new Fault('Request too large.', 413);
        const text = await request.text();
        if (text.length > 4096)
            throw new Fault('Request too large.', 413);
        let body: RecordRow;
        try {
            body = JSON.parse(text);
        }
        catch {
            throw new Fault('Invalid request.');
        }
        if (!body || typeof body !== 'object')
            throw new Fault('Invalid request.');
        const db = database();
        const u = await player(db);
        if (!u)
            throw new Fault('Sign in with ChatGPT to play.', 401);
        const action = body.action;
        if (action === 'profile') {
            const name = String(body.name || '').trim();
            if (name.length < 2 || name.length > 24 || /[\x00-\x1f]/.test(name))
                throw new Fault('Use a name between 2 and 24 characters.');
            await db.prepare('UPDATE players SET name=? WHERE id=?').bind(name, u.id).run();
            return reply({ ok: true });
        }
        if (action === 'addFriend') {
            const c = String(body.code || '').trim().toUpperCase();
            const friend = await db.prepare('SELECT id FROM players WHERE code=?').bind(c).first<RecordRow>();
            if (!friend)
                throw new Fault('That friend code was not found.');
            if (friend.id === u.id)
                throw new Fault('That’s your code! Ask a friend for theirs.');
            const ids = [u.id, friend.id].sort();
            const old = await db.prepare('SELECT * FROM friendships WHERE a=? AND b=?').bind(...ids).first<RecordRow>();
            if (old)
                throw new Fault(old.accepted ? 'You are already friends.' : old.requester === u.id ? 'Your request is already pending.' : 'This player already invited you. Accept their request in Your circle.');
            await db.prepare('INSERT OR IGNORE INTO friendships (a,b,requester) VALUES (?,?,?)').bind(...ids, u.id).run();
            return reply({ ok: true });
        }
        if (action === 'accept' || action === 'decline') {
            const ids = [u.id, String(body.friendId || '')].sort();
            const sql = action === 'accept' ? 'UPDATE friendships SET accepted=1 WHERE a=? AND b=? AND requester<>? AND accepted=0' : 'DELETE FROM friendships WHERE a=? AND b=? AND requester<>? AND accepted=0';
            const r = await db.prepare(sql).bind(...ids, u.id).run();
            if (!r.meta.changes)
                throw new Fault('This request is no longer pending.');
            return reply({ ok: true });
        }
        if (action === 'create') {
            const c = code();
            const r = await db.prepare('INSERT INTO rooms (code,host,created) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM rooms WHERE host=? AND created>?)<20').bind(c, u.id, now(), u.id, now() - 86400000).run();
            if (!r.meta.changes)
                throw new Fault('You’ve created 20 rooms today. Reuse a recent room for more rounds.');
            await db.prepare('INSERT INTO members (room,user) VALUES (?,?)').bind(c, u.id).run();
            return reply({ room: c });
        }
        if (action === 'join') {
            const c = String(body.code || '').trim().toUpperCase();
            if (!/^[A-F0-9]{10}$/.test(c))
                throw new Fault('Enter the 10-character room code.');
            const r = await db.prepare('SELECT * FROM rooms WHERE code=?').bind(c).first<RecordRow>();
            if (!r)
                throw new Fault('That room was not found. Check your code.');
            const existing = await db.prepare('SELECT user FROM members WHERE room=? AND user=?').bind(c, u.id).first();
            if (existing)
                return reply({ room: c });
            const inserted = await db.prepare("INSERT OR IGNORE INTO members (room,user) SELECT ?,? WHERE (SELECT COUNT(*) FROM members WHERE room=?)<8 AND EXISTS(SELECT 1 FROM rooms WHERE code=? AND status='waiting')").bind(c, u.id, c, c).run();
            if (!inserted.meta.changes)
                throw new Fault(r.status === 'waiting' ? 'This room is full (8 players).' : 'This round has already started. Ask the host to open the next round.');
            return reply({ room: c });
        }
        const rcode = String(body.room || '');
        if (action === 'start' || action === 'rematch') {
            let r = await roomFor(db, rcode, u.id);
            r = (await refreshRoom(db, r))!;
            if (r.host !== u.id)
                throw new Fault('Only the room host can start a round.', 403);
            if (action === 'rematch') {
                if (r.status !== 'finished')
                    throw new Fault('Let everyone finish this round first.');
                await db.prepare("UPDATE rooms SET status='waiting',game_id=NULL WHERE code=? AND status='finished'").bind(rcode).run();
                return reply({ ok: true });
            }
            if (r.status !== 'waiting')
                throw new Fault('This round has already started.');
            const count = await db.prepare('SELECT COUNT(*) AS n FROM members WHERE room=?').bind(rcode).first<RecordRow>();
            if (count!.n < 2)
                throw new Fault('Invite at least one friend before starting.');
            const id = crypto.randomUUID(), started = now();
            await db.batch([db.prepare("INSERT INTO games (id,room,answer,started) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM rooms WHERE code=? AND status='waiting')").bind(id, rcode, randomWord(), started, rcode), db.prepare("UPDATE rooms SET game_id=?,round=round+1,status='playing' WHERE code=? AND status='waiting' AND EXISTS(SELECT 1 FROM games WHERE id=?)").bind(id, rcode, id), db.prepare('INSERT OR IGNORE INTO progress (game,user,started) SELECT ?,user,? FROM members WHERE room=? AND EXISTS(SELECT 1 FROM games WHERE id=?)').bind(id, started, rcode, id)]);
            return reply({ ok: true });
        }
        if (action === 'guess') {
            const word = String(body.word || '').toUpperCase();
            if (!isWord(word))
                throw new Fault('Not in the word list. Try another five-letter word.');
            const g = await db.prepare('SELECT * FROM games WHERE id=?').bind(String(body.gameId || '')).first<RecordRow>();
            if (!g)
                throw new Fault('This puzzle is unavailable. Refresh and try again.');
            if (g.room) {
                const r = await roomFor(db, g.room, u.id);
                if (r.status !== 'playing' || r.game_id !== g.id)
                    throw new Fault('This round has ended. Refresh your board.');
            }
            else if (g.day !== new Date().toISOString().slice(0, 10))
                throw new Fault('A new daily word is ready. Refresh to play.');
            await gameView(db, g, u.id);
            const p = (await db.prepare('SELECT * FROM progress WHERE game=? AND user=?').bind(g.id, u.id).first<RecordRow>())!;
            if (p.status !== 'playing')
                throw new Fault('You’ve already finished this puzzle.');
            if (body.version !== p.attempts)
                throw new Fault('Your board changed in another tab. Wait a moment and try again.', 409);
            const rows = JSON.parse(p.rows);
            if (rows.some((r: RecordRow) => r.word === word))
                throw new Fault('You’ve tried that word. Try a different one.');
            rows.push({ word, marks: scoreGuess(word, g.answer) });
            const status = word === g.answer ? 'won' : rows.length === 6 ? 'lost' : 'playing';
            const saved = await db.prepare("UPDATE progress SET rows=?,attempts=?,status=?,finished=? WHERE game=? AND user=? AND attempts=? AND status='playing'").bind(JSON.stringify(rows), rows.length, status, status === 'playing' ? null : now(), g.id, u.id, p.attempts).run();
            if (!saved.meta.changes)
                throw new Fault('Your board changed. Wait a moment and try again.', 409);
            if (g.room)
                await refreshRoom(db, { code: g.room, status: 'playing', game_id: g.id });
            return reply({ ok: true });
        }
        throw new Fault('Unknown action.');
    }
    catch (e) {
        return failure(e);
    }
}
