const mineflayer = require('mineflayer');
const { SocksClient } = require('socks');
const proxypool = require('./proxypool');
const config = require('./config.json');

// --slice <start> <count>  →  usa só uma fatia dos nicks (pra rodar múltiplos CMDs em paralelo)
const sliceIdx = process.argv.indexOf('--slice');
if (sliceIdx !== -1) {
  const start = parseInt(process.argv[sliceIdx + 1], 10) || 0;
  const count = parseInt(process.argv[sliceIdx + 2], 10) || config.nicks.length;
  config.nicks = config.nicks.slice(start, start + count);
}

let poolMgr = null; // setado no boot se proxyPool.enabled

// ── estado por nick ──
// status: 'off' | 'connecting' | 'on' | 'banned'
const S = {};
config.nicks.forEach(n => (S[n] = { status: 'off', banned: false, spawnAt: 0, attempts: 0, lastReason: '—', lastDetectS: null }));

const bots = {}; // nick -> bot (pra desconectar no Ctrl+C)
const stats = { detections: [], startAt: Date.now() }; // {nick, sec} por deteccao de anticheat

function ts() { return new Date().toLocaleTimeString(); }

// ── cores ANSI + helpers de caixa ──
const A = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', gray: '\x1b[90m', magenta: '\x1b[35m', white: '\x1b[37m',
};
const noColor = !!process.env.NO_COLOR || (config.panel && config.panel.color === false);
const col = (c, s) => noColor ? s : (A[c] || '') + s + A.reset;
const stripA = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const visLen = (s) => stripA(s).length;
const padVis = (s, n) => s + ' '.repeat(Math.max(0, n - visLen(s)));
const dash = (n) => '─'.repeat(Math.max(0, n));

// desenha caixa com titulo + linhas (auto-largura, ignora codigos de cor)
function drawBox(title, rows) {
  const CW = Math.max(54, visLen(title) + 4, ...rows.map(visLen));
  const B = CW + 2;
  const out = [];
  out.push(col('cyan', '╭─ ') + col('bold', title) + col('cyan', ' ' + dash(CW - 1 - visLen(title)) + '╮'));
  rows.forEach(r => {
    if (r === '---') out.push(col('cyan', '├' + dash(B) + '┤'));
    else out.push(col('cyan', '│ ') + padVis(r, CW) + col('cyan', ' │'));
  });
  out.push(col('cyan', '╰' + dash(B) + '╯'));
  return out.join('\n');
}

// ── painel in-place (redesenha no lugar) + buffer de logs ──
const inplace = !noColor && !(config.panel && config.panel.inplace === false);
const LOGN = (config.panel && config.panel.logLines) || 14;
const logBuf = [];
function output(line) {
  if (inplace) { logBuf.push(line); while (logBuf.length > LOGN) logBuf.shift(); scheduleRender(); }
  else console.log(line);
}
let lastRender = 0, renderPending = null;
function scheduleRender() {
  if (!inplace) return;
  const now = Date.now();
  if (now - lastRender > 120) { lastRender = now; render(); }
  else if (!renderPending) renderPending = setTimeout(() => { renderPending = null; lastRender = Date.now(); render(); }, 120);
}
let firstRender = true;
function render() {
  if (!inplace) return;
  let out = '';
  if (firstRender) { out += '\x1b[2J\x1b[3J'; firstRender = false; } // limpa uma vez só
  out += '\x1b[H'; // cursor topo (sem apagar tela → sem flicker)
  const lines = (buildPanel() + '\n\n' + logBuf.join('\n')).split('\n');
  out += lines.map(l => l + '\x1b[K').join('\n'); // sobrescreve + apaga fim de cada linha
  out += '\x1b[0J'; // apaga linhas antigas abaixo (se frame encolheu)
  process.stdout.write(out);
}

// resumo das estatisticas (deteccoes do anticheat)
function statsLine() {
  const n = stats.detections.length;
  if (!n) return col('gray', 'bans: 0');
  const d = stats.detections.map(x => x.sec).filter(s => s != null); // só os que spawnaram
  let t = '';
  if (d.length) {
    const min = Math.min(...d).toFixed(1), max = Math.max(...d).toFixed(1);
    const avg = (d.reduce((a, b) => a + b, 0) / d.length).toFixed(1);
    t = `  det ${min}/${avg}/${max}s (min/med/max)`;
  }
  return col('red', `bans: ${n}`) + col('gray', t);
}

// colore linha de log conforme emoji/estado
function tint(msg) {
  if (noColor) return msg;
  if (msg.includes('✅') || /CONECTOU/.test(msg)) return col('green', msg);
  if (msg.includes('🛑')) return col('red', msg);
  if (msg.includes('🌐')) return col('yellow', msg);
  if (msg.includes('🔗')) return col('magenta', msg);
  if (msg.includes('⏳') || msg.includes('↺') || /caiu|recone/.test(msg)) return col('gray', msg);
  return msg;
}

// ── anti-spam de log: agrupa linhas identicas consecutivas ──
let lastKey = null, repeat = 0;
function log(nick, msg) {
  const key = nick + '|' + msg;
  if (key === lastKey) {
    repeat++;
    if (repeat % 10 === 0) output(col('gray', `[${ts()}] [${nick}] ↑ (repetiu ${repeat}x)`));
    return;
  }
  if (repeat > 0 && repeat % 10 !== 0) output(col('gray', `[${ts()}] ↑ (total ${repeat + 1}x)`));
  lastKey = key; repeat = 0;
  output(`${col('gray', '[' + ts() + ']')} ${col('cyan', '[' + nick + ']')} ${tint(msg)}`);
}

// resolve proxy do nick: per-nick > pool > global > nenhum
// per-nick que ja falhou em rede nesta sessao (st.dropPerNick) é ignorado → cai pro pool
function getProxy(nick) {
  const per = (config.proxyPerNick || {})[nick];
  if (per && per.trim() && !S[nick].dropPerNick) {
    const p = per.split(':');
    return { host: p[0], port: parseInt(p[1], 10), type: (config.proxy && config.proxy.type) || 5, userId: p[2] || undefined, password: p[3] || undefined, _perNick: true };
  }
  if (poolMgr && poolMgr.size()) { const p = poolMgr.next(); if (p) p._pool = true; return p; }
  if (config.proxy && config.proxy.enabled && config.proxy.host) {
    return { host: config.proxy.host, port: config.proxy.port, type: config.proxy.type || 5, userId: config.proxy.username || undefined, password: config.proxy.password || undefined };
  }
  return null;
}

// extrai texto legivel de qualquer formato de reason (string/chat/translate)
function reasonText(reason) {
  try {
    // desembrulha NBT {type, value} recursivo
    const unwrap = (x, g = 0) => {
      while (x && typeof x === 'object' && 'type' in x && 'value' in x && !x.text && !x.translate && g++ < 12) x = x.value;
      return x;
    };
    let r = unwrap(typeof reason === 'string' ? JSON.parse(reason) : reason);
    if (!r) return String(reason);
    if (typeof r === 'string') return r.replace(/§./g, '').trim();
    let out = '';
    if (r.text != null && r.text !== '') out = String(unwrap(r.text));
    const tr = unwrap(r.translate);
    if (typeof tr === 'string') out += (out ? ' ' : '') + tr;
    if (Array.isArray(r.with)) out += ' ' + r.with.map(w => reasonText(w)).join(' ');
    if (Array.isArray(r.extra)) out += r.extra.map(e => reasonText(e)).join('');
    out = out.replace(/§./g, '').trim(); // tira codigos de cor
    return out || JSON.stringify(reason);
  } catch (e) { return String(reason); }
}

// ── classifica o motivo do kick/erro ──
function classify(txt) {
  const t = (txt || '').toLowerCase();
  if (/vulcan|grim|matrix|nocheat|aac|spartan|unfair advantage|cheat|hack|illegal|flying is not/.test(t))
    return { cat: 'ANTICHEAT', emoji: '🛑', label: 'DETECTADO/BAN anticheat', stop: true };
  if (/\bbanned\b|ban\.reason|você foi banido|voce foi banido|suspenso/.test(t))
    return { cat: 'BAN', emoji: '🛑', label: 'BANIDO', stop: true };
  if (/already playing|already online|same username|ja esta|já está/.test(t))
    return { cat: 'BUSY', emoji: '🔒', label: 'nick ocupado (online)', stop: false };
  if (/discord|vincular|vincule|link|robolode|robôlode/.test(t))
    return { cat: 'DISCORD', emoji: '🔗', label: 'precisa vincular Discord', stop: true };
  if (/econnreset|etimedout|timed out|timeout|enotfound|econnrefused|socks|proxy|getaddrinfo|network/.test(t))
    return { cat: 'NET', emoji: '🌐', label: 'rede/proxy', stop: false };
  if (/throttl|too fast|wait|aguarde|espere/.test(t))
    return { cat: 'THROTTLE', emoji: '⏳', label: 'throttle do server', stop: false };
  return { cat: 'OTHER', emoji: '❌', label: txt || 'desconhecido', stop: false };
}

// lista cheats ativos (pra exibir)
function cheatsAtivos() {
  const c = config.cheats || {};
  if (!c.enabled) return [];
  return Object.keys(c).filter(k => k !== 'enabled' && c[k] === true);
}

function backoff(st) {
  const base = config.reconnectDelayMs || 500;
  const d = Math.min(base * Math.pow(2, st.attempts), config.maxReconnectMs || 30000);
  return d;
}

function createBot(nick) {
  const st = S[nick];
  if (st.banned) return; // nao reconecta nick banido/detectado
  st.status = 'connecting';
  const proxy = getProxy(nick);
  const opts = { host: config.host, port: config.port, username: nick, version: config.version, auth: 'offline' };

  if (proxy) {
    opts.connect = (client) => {
      SocksClient.createConnection(
        { proxy: { host: proxy.host, port: proxy.port, type: proxy.type, userId: proxy.userId, password: proxy.password },
          command: 'connect', destination: { host: config.host, port: config.port } },
        (err, info) => {
          if (err) { client.emit('error', err); return; }
          client.setSocket(info.socket);
          client.emit('connect');
        }
      );
    };
  }

  const bot = mineflayer.createBot(opts);
  bots[nick] = bot;
  try { require('./cheats')(bot, (m) => log(nick, m), config); } catch (e) { log(nick, 'cheats erro: ' + e.message); }
  let antiAfkTimer = null;
  let nextDelay = backoff(st);
  let handled = false; // evita dupla contagem kick+error+end

  function fail(rawTxt) {
    if (handled) return; handled = true;
    const wasBanned = st.status === 'banned'; // ja estava em estado de ban antes deste fail
    const txt = reasonText(rawTxt);
    const c = classify(txt);
    st.lastReason = `${c.emoji} ${c.label}`;
    // tempo ate deteccao (se chegou a spawnar)
    let tempo = '';
    if (st.spawnAt) {
      st.lastDetectS = ((Date.now() - st.spawnAt) / 1000).toFixed(1);
      tempo = ` em ${st.lastDetectS}s apos spawn`;
    }
    // conta ban/deteccao: 1x por transicao p/ banido (loop de retry nao infla). sec=null se barrou no login
    if ((c.cat === 'ANTICHEAT' || c.cat === 'BAN') && !wasBanned) {
      stats.detections.push({ nick, sec: st.spawnAt ? parseFloat(st.lastDetectS) : null });
    }
    st.attempts++;
    const parar = c.stop && !config.retryBanido;
    if (parar) {
      st.banned = true; st.status = 'banned';
      log(nick, `${c.emoji} ${c.label}${tempo} → "${txt}" [PAROU de tentar]`);
    } else {
      st.status = c.stop ? 'banned' : 'off'; // mostra BAN no resumo mas continua tentando
      let extra = c.stop ? ' [retry mesmo banido]' : '';
      if (c.cat === 'NET' && proxy) {
        if (proxy._perNick) {
          st.dropPerNick = true; // per-nick morto → usa pool da proxima
          extra += ` [per-nick ${proxy.host} morto → vai usar pool]`;
        } else if (proxy._pool && poolMgr && poolMgr.size() > 1) {
          poolMgr.markBad(proxy); // proxy do pool morto → descarta
          extra += ` [proxy ${proxy.host} descartado, ${poolMgr.size()} no pool]`;
        }
      }
      log(nick, `${c.emoji} ${c.label}${tempo} — "${txt}" (retry em ${(backoff(st) / 1000).toFixed(1)}s)${extra}`);
      if (c.cat === 'BUSY') nextDelay = Math.max(backoff(st), config.ghostDelayMs || 3000);
      else if (c.cat === 'THROTTLE') nextDelay = Math.max(backoff(st), config.throttleDelayMs || 10000);
      else nextDelay = backoff(st);
    }
  }

  bot.on('spawn', () => {
    st.status = 'on'; st.spawnAt = Date.now(); st.attempts = 0; handled = false;
    const ch = cheatsAtivos();
    const via = proxy ? ` via ${proxy.host}:${proxy.port}${proxy.ms != null ? ' (' + proxy.ms + 'ms)' : ''}` : ' direto';
    log(nick, `CONECTOU ✅${via} — AFK${ch.length ? ' + CHEATS: ' + ch.join(', ') : ''}`);
    if (config.antiAfk && !ch.length) {
      if (antiAfkTimer) clearInterval(antiAfkTimer);
      antiAfkTimer = setInterval(() => { if (bot.entity) bot.look(Math.random() * Math.PI * 2, (Math.random() - 0.5) * Math.PI, false); }, 30000);
    }
  });

  bot.on('kicked', (reason) => fail(reason));
  bot.on('error', (err) => fail(err && err.message ? err.message : err));

  bot.on('end', () => {
    if (antiAfkTimer) clearInterval(antiAfkTimer);
    if (proxy && proxy._pool && poolMgr) poolMgr.release(proxy); // libera IP do pool
    if (st.status === 'on') { // caiu sem kick/error
      let tempo = st.spawnAt ? ` (ficou ${((Date.now() - st.spawnAt) / 1000).toFixed(1)}s no ar)` : '';
      log(nick, `caiu — reconectando${tempo}`);
      st.lastReason = '↺ caiu';
    }
    if (st.status !== 'banned') st.status = 'off'; // mantem display BAN entre retries
    st.spawnAt = 0;
    if (!st.banned) setTimeout(() => createBot(nick), nextDelay);
  });
}

// ── monta a caixa do painel (string) ──
function buildPanel() {
  const on = config.nicks.filter(n => S[n].status === 'on').length;
  const ch = cheatsAtivos();
  const N = config.nicks.length;
  const onTxt = col(on === N ? 'green' : on > 0 ? 'yellow' : 'red', `ON ${on}/${N}`);
  const chTxt = ch.length ? col('magenta', 'CHEATS: ' + ch.join(',')) : col('gray', 'CHEATS: off');
  const proxTxt = poolMgr ? col('gray', `pool ${poolMgr.size()}/uso ${poolMgr.inUse()}`) : col('gray', 'direto');
  const rows = [`${onTxt}   ${chTxt}   ${proxTxt}`, '---'];

  config.nicks.forEach(n => {
    const st = S[n];
    const nick = col('white', n.padEnd(17));
    let icon, info;
    if (st.status === 'on') {
      icon = col('green', '✅');
      const up = st.spawnAt ? ((Date.now() - st.spawnAt) / 1000).toFixed(0) + 's' : '';
      info = col('gray', ('up ' + up).padEnd(9)) + col('dim', st.lastReason);
    } else if (st.status === 'banned') {
      icon = col('red', '🛑');
      const det = st.lastDetectS ? `ban ${st.lastDetectS}s ` : '';
      info = col('red', det) + col('dim', st.lastReason);
    } else if (st.status === 'connecting') {
      icon = col('yellow', '⏳'); info = col('gray', 'conectando...');
    } else {
      icon = col('gray', '❌'); info = col('dim', st.lastReason);
    }
    rows.push(`${icon} ${nick}${info}`);
  });
  rows.push('---', statsLine());
  return drawBox(`afk-bots ─ ${config.host}:${config.port} (${config.version})`, rows);
}

// ── tick do painel ──
setInterval(() => { if (inplace) render(); else console.log('\n' + buildPanel() + '\n'); }, inplace ? 1000 : 10000);

// ── banner de inicio + boot async (health-check do pool antes de subir) ──
(async () => {
  const ch = cheatsAtivos();
  console.log('────────────────────────────────────────');
  console.log(` afk-bots → ${config.host}:${config.port} (${config.version})`);
  console.log(` nicks: ${config.nicks.join(', ')}`);
  console.log(` cheats: ${ch.length ? 'ON → ' + ch.join(', ') : 'OFF'}`);

  const pp = config.proxyPool || {};
  if (pp.enabled) {
    const ct = pp.checkTarget ? pp.checkTarget.split(':') : null;
    const testDest = ct ? { host: ct[0], port: parseInt(ct[1], 10) } : { host: config.host, port: config.port };
    const alive = await proxypool.buildPool(pp.file || 'top.txt', testDest, pp, (m) => console.log(' ' + m));
    if (alive.length) {
      poolMgr = proxypool.manager(alive);
      // re-testa top.txt a cada 5min e reabastece proxies que voltaram
      setInterval(async () => {
        await poolMgr.refreshFrom(pp.file || 'top.txt', testDest, pp, (m) => output(' [pool] ' + m));
      }, 5 * 60 * 1000);
    } else console.log(' pool vazio — bots aguardam proxy (sem fallback direto)');
  }
  const proxLabel = poolMgr ? `POOL ${poolMgr.size()} vivos` : (config.proxy && config.proxy.enabled ? config.proxy.host : 'OFF/direto');
  console.log(` proxy: ${proxLabel} (+per-nick)`);
  console.log('────────────────────────────────────────');
  config.nicks.forEach((nick, i) => setTimeout(() => createBot(nick), i * config.spawnDelayMs));
})();

// ── Ctrl+C: desconecta todos + relatorio final ──
let shuttingDown = false;
process.on('SIGINT', () => {
  if (shuttingDown) process.exit(0);
  shuttingDown = true;
  process.stdout.write('\x1b[2J\x1b[3J\x1b[H'); // limpa painel
  const upMin = ((Date.now() - stats.startAt) / 60000).toFixed(1);
  const n = stats.detections.length;
  const d = stats.detections.map(x => x.sec).filter(s => s != null);
  console.log(col('bold', '\n── RELATORIO afk-bots ──'));
  console.log(` rodou: ${upMin} min`);
  console.log(` bans/deteccoes: ${n}`);
  if (d.length) {
    const min = Math.min(...d).toFixed(1), max = Math.max(...d).toFixed(1);
    const avg = (d.reduce((a, b) => a + b, 0) / d.length).toFixed(1);
    console.log(` tempo spawn→ban: min ${min}s / med ${avg}s / max ${max}s`);
  }
  stats.detections.forEach(x => console.log(`   • ${x.nick.padEnd(18)} ${x.sec != null ? x.sec + 's' : 'no login (já banido)'}`));
  console.log(col('gray', '\n desconectando bots...'));
  Object.entries(bots).forEach(([n, b]) => { S[n].banned = true; try { b.quit('shutdown'); } catch (_) {} });
  setTimeout(() => process.exit(0), 1500);
});
