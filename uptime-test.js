const mineflayer = require('mineflayer');
const cfg = require('./config.json');
let spawnAt = 0;
function mk() {
  const bot = mineflayer.createBot({ host: cfg.host, port: cfg.port, username: 'KarmaKDS', version: cfg.version, auth: 'offline' });
  bot.on('spawn', () => { spawnAt = Date.now(); console.log(new Date().toLocaleTimeString(), 'CONECTOU'); });
  bot.on('kicked', r => console.log(new Date().toLocaleTimeString(), 'KICK', JSON.stringify(r).slice(0,120)));
  bot.on('error', e => console.log('ERR', e.message));
  bot.on('end', () => {
    const up = spawnAt ? ((Date.now()-spawnAt)/1000).toFixed(1)+'s on' : 'nao spawnou';
    console.log(new Date().toLocaleTimeString(), 'CAIU —', up, '— reconectando 2s');
    spawnAt = 0;
    setTimeout(mk, 2000);
  });
}
mk();
