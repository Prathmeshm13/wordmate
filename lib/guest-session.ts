const COOKIE = '__Host-wordmates_guest';
const YEAR = 365 * 24 * 60 * 60;
async function hash(token:string) {
 const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 return Array.from(new Uint8Array(bytes), b=>b.toString(16).padStart(2,'0')).join('');
}
export async function guestPlayer(db:D1Database,request:Request) {
 const token=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
 return db.prepare('SELECT p.id,p.name,p.code FROM guest_sessions s JOIN players p ON p.id=s.user WHERE s.token_hash=? AND s.expires>?').bind(await hash(token),Date.now()).first<Record<string,any>>();
}
export async function createGuestSession(db:D1Database,request:Request,previousUser?:{userId:string;fullName:string|null}|null) {
 const existing=await guestPlayer(db,request);
 if(existing)return Response.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
 const id=previousUser?.userId||crypto.randomUUID();
 const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
 const name=previousUser?.fullName?.slice(0,24)||'Guest '+crypto.randomUUID().slice(0,4).toUpperCase();
 const code=crypto.randomUUID().replaceAll('-','').slice(0,10).toUpperCase();
 await db.batch([db.prepare('INSERT OR IGNORE INTO players (id,name,code) VALUES (?,?,?)').bind(id,name,code),db.prepare('INSERT INTO guest_sessions (token_hash,user,expires) VALUES (?,?,?)').bind(await hash(token),id,Date.now()+YEAR*1000)]);
 return Response.json({ok:true},{headers:{'Cache-Control':'private, no-store','Set-Cookie':`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${YEAR}`}});
}
