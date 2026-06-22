const mineflayer = require('mineflayer');
const cfg = require('./config.json');
const bot = mineflayer.createBot({ host: cfg.host, port: cfg.port, username: 'KarmaKDS', version: cfg.version, auth: 'offline' });
function flat(n){ if(!n) return ''; if(typeof n==='string') return n; const v=n.value!==undefined?n.value:n; if(typeof v==='string') return v; let s=v&&v.text?flat(v.text):''; const ex=v&&v.extra?v.extra:n.extra; if(ex){const list=ex.value?ex.value.value||ex.value:ex; (Array.isArray(list)?list:[]).forEach(e=>s+=flat(e.text?e.text:e));} return s; }
bot.on('kicked', r => { console.log('=== KICK MSG ==='); try{console.log(flat(r));}catch(e){console.log(JSON.stringify(r));} process.exit(0); });
bot.on('error', e => { console.log('ERR', e.message); process.exit(1); });
setTimeout(()=>{console.log('sem kick em 35s');process.exit(0);},35000);
