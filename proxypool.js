'use strict';
// Pool de proxies SOCKS5: health-check no boot + rotacao + descarte de morto.
const fs = require('fs');
const { SocksClient } = require('socks');

function parse(line) {
  const p = (line || '').trim().split(':');
  if (!p[0] || !p[1]) return null;
  return { host: p[0], port: parseInt(p[1], 10), type: 5, userId: p[2] || undefined, password: p[3] || undefined };
}

// testa 1 proxy abrindo SOCKS->destino; retorna latencia ms ou null
function testProxy(proxy, target, timeoutMs) {
  return new Promise((res) => {
    const t0 = Date.now();
    let done = false;
    const finish = (v) => { if (!done) { done = true; res(v); } };
    const to = setTimeout(() => finish(null), timeoutMs);
    try {
      SocksClient.createConnection(
        { proxy, command: 'connect', destination: { host: target.host, port: target.port } },
        (err, info) => {
          clearTimeout(to);
          if (err) {
            // ECONNREFUSED do destino = proxy roteou o pacote, servidor que recusou → proxy viva
            if (err.message && err.message.includes('ECONNREFUSED')) return finish(Date.now() - t0);
            return finish(null);
          }
          try { info.socket.destroy(); } catch (_) {}
          finish(Date.now() - t0);
        }
      );
    } catch (_) { clearTimeout(to); finish(null); }
  });
}

// testa lista inteira em lotes; retorna vivos ordenados por latencia
async function buildPool(file, target, opts, log) {
  const timeoutMs = opts.testTimeoutMs || 4000;
  const concurrency = opts.concurrency || 20;
  let lines = [];
  try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean); }
  catch (_) { log(`pool: nao consegui ler ${file}`); return []; }
  const seen = new Set();
  const cands = lines.map(parse).filter(Boolean).filter((p) => {
    const k = p.host + ':' + p.port;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  log(`pool: testando ${cands.length} proxies de ${file} (timeout ${timeoutMs}ms)...`);
  const alive = [];
  for (let i = 0; i < cands.length; i += concurrency) {
    const batch = cands.slice(i, i + concurrency);
    const r = await Promise.all(batch.map(async (p) => {
      const ms = await testProxy(p, target, timeoutMs);
      return ms != null ? Object.assign({}, p, { ms }) : null;
    }));
    r.filter(Boolean).forEach((p) => alive.push(p));
  }
  const brPfx = ['177.','178.','179.','186.','187.','189.','191.','200.','201.','138.36.','168.205.','170.244.','45.7.','131.72.','157.185.'];
  const isBR = (h) => brPfx.some(p => h.startsWith(p));
  alive.sort((a, b) => {
    const d = (isBR(a.host) ? 0 : 1) - (isBR(b.host) ? 0 : 1);
    return d !== 0 ? d : a.ms - b.ms;
  });
  log(`pool: ${alive.length}/${cands.length} VIVOS` + (alive[0] ? ` — melhor ${alive[0].host}:${alive[0].port} ${alive[0].ms}ms` : ' (nenhum!)'));
  return alive;
}

// gerenciador round-robin com descarte + anti-colisao (nao da o mesmo IP a 2 nicks on)
function manager(list) {
  let pool = list.slice();
  let idx = 0;
  const inUse = new Set(); // "host:port" em uso por um bot conectado
  const key = (p) => p.host + ':' + p.port;
  return {
    size: () => pool.length,
    // pega proximo IP livre (round-robin). se todos em uso, devolve um mesmo assim (colisao inevitavel).
    next: () => {
      if (!pool.length) return null;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[(idx + i) % pool.length];
        if (!inUse.has(key(p))) { idx = (idx + i + 1) % pool.length; inUse.add(key(p)); return p; }
      }
      const p = pool[idx % pool.length]; idx++; return p; // todos ocupados → reusa
    },
    release: (p) => { if (p) inUse.delete(key(p)); },
    markBad: (p) => { if (p) { inUse.delete(key(p)); pool = pool.filter((x) => key(x) !== key(p)); } },
    inUse: () => inUse.size,
    list: () => pool.slice(),
    // re-testa arquivo, re-adiciona proxies vivos que nao estao no pool atual
    refreshFrom: async (file, target, opts, log) => {
      const fresh = await buildPool(file, target, { ...opts, concurrency: opts.concurrency || 20 }, log);
      const existing = new Set(pool.map(key));
      const added = fresh.filter((p) => !existing.has(key(p)));
      added.forEach((p) => pool.push(p));
      if (added.length) log(`pool: +${added.length} proxy(s) recuperado(s) — total ${pool.length}`);
      return added.length;
    },
  };
}

module.exports = { parse, testProxy, buildPool, manager };
