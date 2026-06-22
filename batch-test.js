// testa muitos proxies SOCKS5 em paralelo, lista os que funcionam por latencia
const { SocksClient } = require('socks');

const list = require('fs').readFileSync(process.argv[2], 'utf8')
  .split('\n').map(s => s.trim()).filter(Boolean);

const TIMEOUT = 8000;

function test(line) {
  const [host, portStr] = line.split(':');
  const port = parseInt(portStr, 10);
  return new Promise((resolve) => {
    const t0 = Date.now();
    let done = false;
    const finish = (ok, ip) => {
      if (done) return;
      done = true;
      resolve({ line, ok, ms: Date.now() - t0, ip });
    };
    const timer = setTimeout(() => finish(false), TIMEOUT);
    SocksClient.createConnection(
      { proxy: { host, port, type: 5 }, command: 'connect', timeout: TIMEOUT,
        destination: { host: 'api.ipify.org', port: 80 } },
      (err, info) => {
        if (err) { clearTimeout(timer); return finish(false); }
        info.socket.write('GET /?format=text HTTP/1.1\r\nHost: api.ipify.org\r\nConnection: close\r\n\r\n');
        let data = '';
        info.socket.on('data', d => (data += d.toString()));
        info.socket.on('end', () => { clearTimeout(timer); finish(true, (data.split('\r\n\r\n')[1] || '').trim()); });
        info.socket.on('error', () => { clearTimeout(timer); finish(false); });
      }
    );
  });
}

(async () => {
  console.log(`testando ${list.length} proxies...`);
  const results = await Promise.all(list.map(test));
  const ok = results.filter(r => r.ok).sort((a, b) => a.ms - b.ms);
  console.log(`\n=== ${ok.length} FUNCIONAM ===`);
  ok.forEach(r => console.log(`${r.line}\t${r.ms}ms\tIP saida: ${r.ip}`));
})();
