// testa se o proxy alcanca o server MC (TCP connect ate host:port do jogo)
const { SocksClient } = require('socks');
const cfg = require('./config.json');

const cands = require('fs').readFileSync(process.argv[2], 'utf8')
  .split('\n').map(s => s.trim()).filter(Boolean);

const TIMEOUT = 9000;

function test(line) {
  const [host, portStr] = line.split(':');
  const port = parseInt(portStr, 10);
  return new Promise((resolve) => {
    const t0 = Date.now();
    let done = false;
    const fin = (ok) => { if (done) return; done = true; resolve({ line, ok, ms: Date.now() - t0 }); };
    const timer = setTimeout(() => fin(false), TIMEOUT);
    SocksClient.createConnection(
      { proxy: { host, port, type: 5 }, command: 'connect', timeout: TIMEOUT,
        destination: { host: cfg.host, port: cfg.port } },
      (err, info) => {
        clearTimeout(timer);
        if (err) return fin(false);
        info.socket.destroy();
        fin(true);
      }
    );
  });
}

(async () => {
  console.log(`testando ${cands.length} proxies -> ${cfg.host}:${cfg.port}`);
  const r = (await Promise.all(cands.map(test))).filter(x => x.ok).sort((a, b) => a.ms - b.ms);
  console.log(`\n=== ${r.length} ALCANCAM O SERVER MC ===`);
  r.forEach(x => console.log(`${x.line}\t${x.ms}ms`));
})();
