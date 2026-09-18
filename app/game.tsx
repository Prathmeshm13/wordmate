"use client";
import { useEffect, useRef, useState } from "react";
import { Users, Trophy, ArrowUpRight, Plus, Copy, Delete, HelpCircle, Check, ArrowLeft, Play, RotateCcw, CalendarDays, Send, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
type Row = {
    word: string;
    marks: number[];
};
type State = any;
const keys = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
export default function Game() {
    const [data, setData] = useState<State>(null), [room, setRoom] = useState(""), [mode, setMode] = useState("daily"), [draft, setDraft] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [dialog, setDialog] = useState(""), [code, setCode] = useState(""), [name, setName] = useState(""), [loading, setLoading] = useState(true);
    const current = useRef({ room, mode });
    current.current = { room, mode };
    const startingSession = useRef<Promise<void>|null>(null);
    async function ensureSession() {
        if(!startingSession.current) startingSession.current = (async()=>{
            const response=await fetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'session'})});
            if(!response.ok) throw Error('Could not start your game. Please try again.');
        })().finally(()=>{startingSession.current=null});
        return startingSession.current;
    }
    async function load(r = current.current.room) { try {
        let res = await fetch(`/api/game${r ? '?room=' + encodeURIComponent(r) : ''}`);
        let d: State = await res.json();
        if(res.ok&&!d.user){
            await ensureSession();
            res=await fetch(`/api/game${r?'?room='+encodeURIComponent(r):''}`);
            d=await res.json();
            if(res.ok&&!d.user)throw Error('Allow cookies for this site to save your player and start playing.');
        }
        if (!res.ok)
            throw Error(d.error || "Could not connect.");
        if (r === current.current.room) {
            setData(d);
            setError("");
        }
    }
    catch (e: any) {
        setError(e.message);
    }
    finally {
        setLoading(false);
    } }
    useEffect(() => { const r = new URLSearchParams(location.search).get('room'); if (r) {
        setCode(r);
        setDialog('join');
    } }, []);
    useEffect(() => { setDraft(''); load(room); const t = setInterval(() => { if (document.visibilityState === 'visible')
        load(room); }, room ? 3000 : 15000); return () => clearInterval(t); }, [room]);
    async function act(action: string, extra: State = {}) { setBusy(true); try {
        const res = await fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, room: current.current.room, ...extra }) });
        const d: State = await res.json();
        if (!res.ok)
            throw Error(d.error || 'Please try again.');
        if (d.room) {
            current.current.room = d.room;
            setRoom(d.room);
            setMode('room');
            history.replaceState(null, '', '?room=' + d.room);
        }
        await load(current.current.room);
        return d;
    }
    catch (e: any) {
        toast.error(e.message);
        throw e;
    }
    finally {
        setBusy(false);
    } }
    const run = (a: string, e: State = {}) => act(a, e).catch(() => { });
    const game = room ? data?.room?.game : data?.daily;
    const rows: Row[] = game?.rows || [];
    const finished = game?.status === 'won' || game?.status === 'lost';
    const playable = !!data?.user && !!game && !finished && (!room || data?.room?.status === 'playing');
    async function submit(word = draft) { if (!playable || busy)
        return; if (word.length !== 5) {
        toast.error('A little longer — five letters needed.');
        return;
    } try {
        await act('guess', { word, gameId: game.id, version: rows.length });
        setDraft('');
    }
    catch { } }
    function press(key: string) { if (!playable || busy)
        return; if (key === 'Enter')
        void submit();
    else if (key === 'Backspace')
        setDraft(s => s.slice(0, -1));
    else if (/^[a-z]$/i.test(key))
        setDraft(s => s.length < 5 ? s + key.toUpperCase() : s); }
    useEffect(() => { function onKey(e: KeyboardEvent) { if (dialog || e.ctrlKey || e.metaKey || e.altKey || ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName))
        return; if (e.key === 'Enter' || e.key === 'Backspace' || /^[a-z]$/i.test(e.key)) {
        e.preventDefault();
        press(e.key);
    } } window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [draft, busy, game, dialog, data]);
    const toolRef = useRef<State>({});
    toolRef.current = { data, game, submit };
    useEffect(() => { const ctx = (document as any).modelContext; if (!ctx?.registerTool)
        return; const c = new AbortController(); Promise.resolve(ctx.registerTool({ name: 'get_word_game', description: 'Read the current board and room, without revealing the answer.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: (input: unknown) => { if (!input || typeof input !== 'object' || Object.keys(input).length)
            throw Error('Expected an empty object.'); return { room: current.current.room, game: toolRef.current.game || null }; } }, { signal: c.signal })).catch(() => { }); return () => c.abort(); }, []);
    useEffect(() => { setDraft(''); }, [game?.id]);
    const keyboard: Record<string, number> = {};
    rows.forEach(row => row.word.split('').forEach((c, i) => keyboard[c] = Math.max(keyboard[c] ?? -1, row.marks[i])));
    async function copy(text: string) { try {
        await navigator.clipboard.writeText(text);
        toast.success('Copied. Send it to your friends!');
    }
    catch {
        setCode(text);
        setDialog('copy');
    } }
    function leave() { setRoom(''); current.current.room = ''; setMode('daily'); history.replaceState(null, '', '/'); setData(null); setLoading(true); load(''); }

    return <><Toaster theme="dark" position="top-center"/><header className="topbar"><a href="/" className="brand"><span className="brand-icon">w<span>·</span></span>wordmates<span className="brand-label">THE WORD CLUB</span></a><div className="header-actions"><button className="icon-button" aria-label="How to play" onClick={() => setDialog('help')}><HelpCircle size={20}/></button>{data?.user ? <button className="profile" onClick={() => { setName(data.user.name); setDialog('profile'); }}><span className="avatar">{data.user.name.slice(0, 1).toUpperCase()}</span><span>{data.user.name}</span></button> : <span className="muted">Starting your game…</span>}</div></header>
 <main className="shell"><div className="page-intro"><div><div className="eyebrow">GOOD WORDS. BETTER COMPANY.</div><h1>A little friendly wordplay<span>.</span></h1></div><div className="intro-note">Five letters. Six guesses.<br /><span>A new reason to catch up.</span></div></div>
 <div className="workspace"><section className="play-panel"><div className="play-top"><Tabs value={mode} onValueChange={v => { if (v === 'daily')
        leave();
    else {
        setMode(v);
        if (!room)
            setDialog('play');
    } }}><TabsList className="game-tabs"><TabsTrigger value="daily"><CalendarDays size={16}/>Daily word</TabsTrigger><TabsTrigger value="room"><Users size={16}/>With friends</TabsTrigger></TabsList></Tabs><button className="text-button" onClick={() => setDialog('help')}>How to play <HelpCircle size={15}/></button></div>
 <div className="puzzle-heading">{room ? <><div className="eyebrow">FRIENDS ROOM · {data?.room?.code || room}</div><h2>{data?.room?.status === 'waiting' ? 'The room is yours.' : `Round ${data?.room?.round || 1}`}</h2></> : <><div className="eyebrow">THE DAILY CHALLENGE</div><h2>Same word. Your way.</h2></>}<p>{room ? 'Solve the same word. Fewest guesses takes the win.' : `${data?.date || 'One fresh puzzle every day'} · Resets at midnight UTC`}</p></div>
 {error && <div className="connection-error" role="alert">{error}<button onClick={() => load()}>Retry</button></div>}
 {room && data?.room?.status === 'waiting' ? <div className="lobby"><div className="lobby-symbol"><Users size={36}/></div><h3>Bring your favourite rivals.</h3><p>Share the room link. Start when everyone is here.</p><button className="button" onClick={() => copy(location.origin + '/?room=' + room)}><Copy size={17}/>Copy invite link</button><div className="lobby-players">{data.room.players.map((p: State) => <span key={p.id} className="player-chip"><span className="avatar">{p.name[0]}</span>{p.name}{p.id === data.room.hostId ? ' · host' : ''}</span>)}</div>{data.user?.id === data.room.hostId ? <button className="button light" disabled={busy || data.room.players.length < 2} onClick={() => run('start')}><Play size={16}/>Start round {data.room.players.length < 2 ? '· waiting for a friend' : ''}</button> : <p>Waiting for the host to start…</p>}</div> : <><div className="board" role="group" aria-label="Word puzzle, six rows of five letters">{Array.from({ length: 6 }, (_, r) => <div className="board-row" key={r}>{Array.from({ length: 5 }, (_, c) => { const row = rows[r]; const letter = row?.word[c] || (r === rows.length ? draft[c] : ''); return <div key={c} className={`tile ${row ? 'mark-' + row.marks[c] : letter ? 'filled' : ''} ${r === rows.length && !finished ? 'active-row' : ''}`} aria-label={letter ? `${letter}${row ? ', ' + ['absent', 'wrong position', 'correct'][row.marks[c]] : ''}` : 'empty'}>{letter}</div>; })}</div>)}</div>
 <div className="board-status" aria-live="polite">{finished ? <><strong>{game.status === 'won' ? 'Beautifully played.' : 'That was a tricky one.'}</strong> The word was <b>{game.answer}</b>. <button onClick={() => copy(`Wordmates ${room ? 'Round ' + data.room.round : data.date} ${game.status === 'won' ? rows.length : 'X'}/6\n${rows.map(r => r.marks.map(m => ['⬛', '🟨', '🟦'][m]).join('')).join('\n')}\n${location.origin}${room ? '/?room=' + room : ''}`)}>Share result <ArrowUpRight size={14}/></button></> : !data?.user && !loading ? <button onClick={()=>load()}>Retry starting your game</button> : loading ? 'Setting up your board…' : busy ? 'Checking your word…' : rows.length === 0 ? 'Your opening word is a blank canvas.' : `${6 - rows.length} guesses left. You’ve got this.`}</div>
 <div className="keyboard" aria-label="Onscreen keyboard">{keys.map((line, i) => <div className="key-row" key={line}>{i === 2 && <button className="key wide" disabled={!playable || busy} onClick={() => press('Enter')}>ENTER</button>}{line.split('').map(k => <button className={`key ${keyboard[k] !== undefined ? 'mark-' + keyboard[k] : ''}`} key={k} disabled={!playable || busy} onClick={() => press(k)} aria-label={`${k}${keyboard[k] !== undefined ? ', ' + ['absent', 'wrong position', 'correct'][keyboard[k]] : ''}`}>{k}</button>)}{i === 2 && <button className="key wide" disabled={!playable || busy} onClick={() => press('Backspace')} aria-label="Delete last letter"><Delete size={21}/></button>}</div>)}</div></>}
 <div className="board-footer"><span><i className="swatch correct"/>Right spot</span><span><i className="swatch present"/>Wrong spot</span><span><i className="swatch absent"/>Not in word</span></div></section>
 <aside className="side-panel">{room ? <section className="card room-card"><div className="card-heading"><h3>At the table</h3><span className="pill">{data?.room?.players?.length || 0}/8</span></div><p className="muted">Progress updates every 3 seconds.</p><div className="leader-list">{data?.room?.players?.map((p: State, i: number) => <div className="leader" key={p.id}><span className="rank">{i + 1}</span><span className="avatar">{p.name[0]}</span><div><strong>{p.name}{p.id === data?.user?.id ? ' (you)' : ''}</strong><span>{p.status === 'won' ? `Solved in ${p.attempts} · ${p.seconds}s` : p.status === 'lost' ? 'Out of guesses' : `${p.attempts || 0}/6 guesses`}</span></div>{p.status === 'won' ? <Trophy size={17} className="gold"/> : <div className="mini-progress">{Array.from({ length: 6 }, (_, j) => <i className={j < p.attempts ? 'done' : ''} key={j}/>)}</div>}</div>)}</div><button className="button outline full" onClick={() => copy(location.origin + '/?room=' + room)}><Copy size={16}/>Copy room link</button>{data?.room?.status === 'finished' && data?.user?.id === data.room.hostId && <button className="button full" disabled={busy} onClick={() => run('rematch')}><RotateCcw size={16}/>Play another round</button>}<button className="text-button back-link" onClick={leave}><ArrowLeft size={15}/>Back to daily</button></section> : <section className="card friends-card"><div className="card-heading"><span className="card-icon"><Users size={20}/></span><span className="pill">UP TO 8 PLAYERS</span></div><h2>Good friends.<br />Great competition.</h2><p>One shared word. Your own six guesses.<br />A little bragging rights on the line.</p><button className="button full" disabled={busy || loading} onClick={() => data?.user ? run('create') : load()}><Plus size={18}/>Create a room<ArrowUpRight size={18}/></button><button className="button outline full" onClick={() => { setCode(''); setDialog('join'); }}>Join with a code</button><div className="small-note">Private rooms. Share the link to play.</div></section>}
 <section className="card"><div className="card-heading"><h3>Your circle</h3><button className="icon-button" aria-label="Add friends" onClick={() => { setCode(''); setDialog('friends'); }}><UserPlus size={18}/></button></div>{data?.friends?.length ? <div className="friend-list">{data.friends.map((f: State) => <div key={f.id} className="friend"><span className="avatar">{f.name[0]}</span><strong>{f.name}</strong><span>{f.wins} wins</span></div>)}</div> : <div className="circle-empty"><span className="circle-avatars"><i>P</i><i>?</i><i>?</i></span><p>Every good game starts<br />with a familiar face.</p><button className="text-button blue" onClick={() => { setCode(''); setDialog('friends'); }}>Add your first friend <ArrowUpRight size={15}/></button></div>}{data?.requests?.map((f: State) => <div className="request" key={f.id}><span>{f.name} wants to connect</span><button className="text-button blue" disabled={busy} onClick={() => run('accept', { friendId: f.id })}>Accept</button><button className="text-button" disabled={busy} onClick={() => run('decline', { friendId: f.id })}>Decline</button></div>)}</section>
 <section className="card stats-card"><div className="card-heading"><h3>Your record</h3><Trophy size={18}/></div><div className="stats"><div><strong>{data?.stats?.played || 0}</strong><span>Played</span></div><div><strong>{data?.stats?.wins || 0}</strong><span>Wins</span></div><div><strong>{data?.stats?.played ? Math.round(data.stats.wins / data.stats.played * 100) : 0}<small>%</small></strong><span>Win rate</span></div></div></section>
 {!!data?.rooms?.length && !room && <section className="card"><h3>Recent rooms</h3>{data.rooms.map((r: State) => <button className="recent-room" key={r.code} onClick={() => run('join', { code: r.code })}><span>{r.code}<small>Round {r.round} · {r.status}</small></span><ArrowUpRight size={17}/></button>)}</section>}
 </aside></div><footer className="site-footer"><span>wordmates <span>·</span> A daily ritual, together.</span><span>Independent word game. Not affiliated with NYT Wordle.</span></footer></main>
 <Dialog open={!!dialog} onOpenChange={v => !v && setDialog('')}><DialogContent className="word-dialog"><DialogTitle>{({ help: 'Six guesses. One good word.', join: 'Pull up a chair.', friends: 'Keep your friends close.', profile: 'Your player profile', copy: 'Copy and share', play: 'A word with friends.' })[dialog] || 'Wordmates'}</DialogTitle><DialogDescription>{dialog === 'play' ? 'Start a private room or join one your friend created.' : dialog === 'help' ? 'Find the five-letter word in six tries. Each guess must be in our English word list.' : dialog === 'join' ? 'Enter the room code your friend shared.' : dialog === 'friends' ? 'Share your friend code or add someone using theirs.' : dialog === 'profile' ? 'Choose the name your friends will see.' : 'Select this text to copy it.'}</DialogDescription>
 {dialog === 'play' ? <div><button className="button full" disabled={busy} onClick={async () => { if (!data?.user) {
        await load();
        return;
    } try {
        await act('create');
        setDialog('');
    }
    catch { } }}><Plus size={17}/>Create a room</button><button className="button outline full" onClick={() => { setCode(''); setDialog('join'); }}>Join with a code</button></div> : dialog === 'help' ? <div className="help-content"><div className="example-row">{'CRANE'.split('').map((c, i) => <span key={c} className={'tile mark-' + [2, 0, 1, 0, 0][i]}>{c}</span>)}</div><p><b>Blue C</b> is in exactly the right spot.</p><p><b>Amber A</b> belongs somewhere else.</p><p><b>Grey letters</b> aren’t in the word, or that letter’s copies are already accounted for.</p><hr /><p>In friend rooms, everyone gets the same word. Fewest guesses wins; finish time breaks ties. Your guesses stay private.</p><p>The daily word resets at midnight UTC. You can always play more in a friend room.</p></div> : !data?.user && dialog !== 'copy' ? <button className="button" onClick={()=>load()}>Retry connection</button> : <>{dialog === 'friends' && <div className="share-code"><span>Your friend code</span><button onClick={() => copy(data.user.code)}>{data.user.code}<Copy size={17}/></button></div>}{dialog !== 'profile' ? <form onSubmit={async (e) => { e.preventDefault(); if (dialog === 'copy')
        return; try {
        await act(dialog === 'join' ? 'join' : 'addFriend', { code });
        setDialog('');
        if (dialog === 'friends')
            toast.success('Friend request sent.');
    }
    catch { } }}><label htmlFor="code">{dialog === 'friends' ? "Your friend’s code" : dialog === 'copy' ? 'Share text' : 'Room code'}</label><input id="code" autoComplete="off" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder={dialog === 'copy' ? '' : 'e.g. A1B2C3D4E5'} required maxLength={dialog === 'copy' ? 1000 : 10}/>{dialog !== 'copy' && <button className="button full" disabled={busy}>{dialog === 'join' ? <Play size={16}/> : <Send size={16}/>} {dialog === 'join' ? 'Join room' : 'Send friend request'}</button>}</form> : <form onSubmit={async (e) => { e.preventDefault(); try {
        await act('profile', { name });
        setDialog('');
        toast.success('Name updated.');
    }
    catch { } }}><label htmlFor="name">Display name</label><input id="name" value={name} onChange={e => setName(e.target.value)} maxLength={24} required/><button className="button full" disabled={busy}><Check size={16}/>Save name</button><p className="muted">Your name and scores stay with this browser. Clearing cookies starts a new player.</p></form>}</>}
 </DialogContent></Dialog></>;
}
