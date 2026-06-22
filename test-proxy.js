// testa um proxy SOCKS5: node test-proxy.js host:porta:user:senha
const { SocksClient } = require('socks');

const arg = process.argv[2];
if (!arg) {
  console.log('uso: node test-proxy.js host:porta  (ou host:porta:user:senha)');
  process.exit(1);
}
const p = arg.split(':');
const proxy = { host: p[0], port: parseInt(p[1], 10), type: 5, userId: p[2], password: p[3] };

const t0 = Date.now();
SocksClient.createConnection(
  {
    proxy,
    command: 'connect',
    destination: { host: 'api.ipify.org', port: 80 }
  },
  (err, info) => {
    if (err) {
      console.log('FALHOU:', err.message);
      process.exit(1);
    }
    const ms = Date.now() - t0;
    info.socket.write('GET /?format=text HTTP/1.1\r\nHost: api.ipify.org\r\nConnection: close\r\n\r\n');
    let data = '';
    info.socket.on('data', (d) => (data += d.toString()));
    info.socket.on('end', () => {
      const ip = data.split('\r\n\r\n')[1] || '?';
      console.log(`OK em ${ms}ms — IP de saida: ${ip.trim()}`);
      process.exit(0);
    });
  }
);
