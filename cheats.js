'use strict';
// ── Anti-cheat TEST harness ─────────────────────────────────────────────
// Emula cheats estilo Meteor via mineflayer pra testar deteccao do anticheat
// do PROPRIO server. Liga/desliga por config.json -> "cheats": {...}.
// Uso: attachCheats(bot, log, config)  (log = fn(msg))

module.exports = function attachCheats(bot, log, cfg) {
  const C = Object.assign({ enabled: false }, cfg.cheats || {});
  if (!C.enabled) return;

  const timers = [];
  const every = (ms, fn) => {
    const t = setInterval(() => { try { fn(); } catch (_) {} }, ms);
    timers.push(t);
    return t;
  };

  bot.once('spawn', () => {
    const ativos = Object.keys(C).filter(k => k !== 'enabled' && C[k] === true);
    log('CHEATS ON → ' + (ativos.join(', ') || 'nenhum'));

    // detecta formato do campo onGround: bool antigo vs MovementFlags (1.21.4+)
    let usesFlags = true;
    try {
      const mcData = require('minecraft-data')(bot.version);
      const f = mcData.protocol.play.toServer.types.packet_flying[1];
      usesFlags = f.some(x => x.name === 'flags');
    } catch (_) {}
    // G(onGround) -> pedaco do payload com o campo certo
    const G = (g) => usesFlags ? { flags: { onGround: g, hasHorizontalCollision: false } } : { onGround: g };
    const w = (name, payload) => { try { bot._client.write(name, payload); } catch (_) {} };
    log('move packet usa ' + (usesFlags ? 'flags(MovementFlags)' : 'onGround(bool)'));

    // ── FLY ── desliga physics, manda position manual (sobe ondulando + anda) ──
    if (C.fly) {
      bot.physicsEnabled = false;
      let t = 0;
      every(50, () => {
        if (!bot.entity) return;
        t += 0.05;
        const p = bot.entity.position;
        const yaw = bot.entity.yaw;
        const sp = C.speed ? (C.flySpeed || 0.6) : 0.25;
        // mineflayer: frente = (-sin yaw, -cos yaw)
        const nx = p.x - Math.sin(yaw) * sp;
        const nz = p.z - Math.cos(yaw) * sp;
        const ny = p.y + Math.sin(t) * 0.3 + 0.08; // sobe = trigger Fly check
        bot.entity.position.set(nx, ny, nz);
        w('position_look', { x: nx, y: ny, z: nz, yaw: yaw * 180 / Math.PI, pitch: 0, ...G(false) });
      });
      every(1500, () => { if (bot.entity) bot.entity.yaw = Math.random() * Math.PI * 2; });
    } else if (C.walk) {
      // ── WALK no chao (physics normal) ──
      bot.setControlState('forward', true);
      bot.setControlState('sprint', !!C.speed);
      every(2000, () => {
        bot.look(Math.random() * Math.PI * 2, 0, false);
        bot.setControlState('jump', Math.random() < 0.4);
      });
    }

    // ── SPEED extra horizontal (so quando NAO voando) ──
    if (C.speed && !C.fly) every(50, () => {
      if (!bot.entity) return;
      const p = bot.entity.position, yaw = bot.entity.yaw;
      w('position', { x: p.x - Math.sin(yaw) * 0.4, y: p.y, z: p.z - Math.cos(yaw) * 0.4, ...G(true) });
    });

    // ── NOFALL ── onGround=true sempre ──
    if (C.nofall) every(100, () => w('flying', G(true)));

    // ── ANTIVOID ── se cair no void, teleporta pra cima (trigger fly/teleport) ──
    if (C.antivoid) every(50, () => {
      if (!bot.entity) return;
      const p = bot.entity.position;
      if (p.y < (C.voidY != null ? C.voidY : 2)) {
        const ny = C.voidUp || 80;
        bot.entity.position.set(p.x, ny, p.z);
        w('position', { x: p.x, y: ny, z: p.z, ...G(false) });
      }
    });

    // ── ANTIHUNGER ── (server-side; em bot headless = best-effort)
    // evita sprint quando fome baixa pra nao gastar; come se tiver comida.
    if (C.antihunger) every(1000, () => {
      try {
        if (bot.food != null && bot.food < 18) bot.setControlState('sprint', false);
        const food = bot.inventory && bot.inventory.items().find(i => i.name && /apple|bread|cooked|carrot|potato|melon|steak|porkchop|beef|chicken/.test(i.name));
        if (bot.food != null && bot.food < 18 && food) { bot.equip(food, 'hand').then(() => bot.consume().catch(() => {})).catch(() => {}); }
      } catch (_) {}
    });

    // ── TIMER ── packets de movimento extra = acelera server-side ──
    if (C.timer) every(50, () => { for (let i = 0; i < 5; i++) w('flying', G(true)); });

    // ── KILLAURA / REACH ── ataca player/mob proximo ──
    if (C.killaura) every(50, () => {
      if (!bot.entity) return;
      const range = C.reach ? 6.0 : 3.5;
      const e = bot.nearestEntity(en =>
        en && en.position && (en.type === 'player' || en.type === 'hostile' || en.type === 'mob') &&
        bot.entity.position.distanceTo(en.position) <= range);
      if (e) {
        bot.lookAt(e.position.offset(0, (e.height || 1.8) * 0.85, 0), false);
        bot.attack(e);
        bot.swingArm();
      }
    });

    // ── TRIGGERBOT (estilo Krypton) ── ataca SO se alvo ja esta na mira (sem snap) ──
    if (C.triggerbot) {
      const fovCos = Math.cos((C.triggerFov || 4) * Math.PI / 180); // cone em graus
      const reach = C.triggerReach || (C.reach ? 6.0 : 3.5);
      const alvo = C.triggerPlayersOnly
        ? (en) => en.type === 'player'
        : (en) => en.type === 'player' || en.type === 'hostile' || en.type === 'mob';
      let aimT = 0;
      every(C.triggerDelayMs || 50, () => {
        if (!bot.entity) return;
        // opcional: mira devagar no alvo mais proximo (pra trigger ter no que disparar)
        if (C.triggerTrack) {
          const near = bot.nearestEntity(en => en && en.position && alvo(en) &&
            bot.entity.position.distanceTo(en.position) <= reach + 2);
          if (near && (aimT++ % 4 === 0)) bot.lookAt(near.position.offset(0, (near.height || 1.8) * 0.85, 0), false);
        }
        // direcao da view atual (Minecraft): x=-cos(p)sin(y), y=-sin(p), z=cos(p)cos(y)
        const yaw = bot.entity.yaw, pitch = bot.entity.pitch;
        const cp = Math.cos(pitch);
        const vd = { x: -cp * Math.sin(yaw), y: -Math.sin(pitch), z: cp * Math.cos(yaw) };
        const eye = bot.entity.position.offset(0, 1.62, 0);
        let best = null, bestDot = fovCos;
        for (const id in bot.entities) {
          const e = bot.entities[id];
          if (!e || e === bot.entity || !e.position || !alvo(e)) continue;
          const tx = e.position.x - eye.x;
          const ty = e.position.y + (e.height || 1.8) * 0.85 - eye.y;
          const tz = e.position.z - eye.z;
          const dist = Math.sqrt(tx * tx + ty * ty + tz * tz);
          if (dist > reach || dist < 0.1) continue;
          const dot = (tx * vd.x + ty * vd.y + tz * vd.z) / dist; // cos do angulo mira->alvo
          if (dot > bestDot) { bestDot = dot; best = e; }
        }
        if (best) { bot.attack(best); bot.swingArm(); }
      });
    }

    // ── CRITICALS ── oscila y → fica "caindo" → hit critico em todo ataque ──
    if (C.criticals && !C.fly) every(100, () => {
      if (!bot.entity) return;
      const p = bot.entity.position;
      w('position', { x: p.x, y: p.y + 0.11, z: p.z, ...G(false) });
      w('position', { x: p.x, y: p.y,         z: p.z, ...G(true)  });
    });

    // ── VELOCITY / ANTIKNOCKBACK ── zera velocidade lateral ao levar hit ──
    if (C.velocity) {
      let lastHp = -1;
      bot.on('health', () => {
        const hp = bot.health;
        if (lastHp >= 0 && hp < lastHp && bot.entity && bot.entity.velocity) {
          bot.entity.velocity.x = 0;
          bot.entity.velocity.z = 0;
        }
        lastHp = hp;
      });
      every(50, () => {
        if (!bot.entity || !bot.entity.velocity) return;
        const v = bot.entity.velocity;
        if (Math.abs(v.x) > 0.15 || Math.abs(v.z) > 0.15) {
          v.x = 0; v.z = 0;
        }
      });
    }

    // ── MULTIAURA ── ataca TODOS em range (nao so nearest) ──
    if (C.multiaura) every(50, () => {
      if (!bot.entity) return;
      const range = C.reach ? 6.0 : 3.5;
      for (const id in bot.entities) {
        const e = bot.entities[id];
        if (!e || e === bot.entity || !e.position) continue;
        if (e.type !== 'player' && e.type !== 'hostile' && e.type !== 'mob') continue;
        if (bot.entity.position.distanceTo(e.position) <= range) {
          bot.attack(e);
          bot.swingArm();
        }
      }
    });

    // ── NUKER / FASTBREAK ── quebra blocos em volta ──
    if (C.nuker) {
      let busy = false;
      every(80, () => {
        if (busy || !bot.entity) return;
        const o = bot.entity.position.floored();
        for (let r = 1; r <= 4; r++)
          for (let dx = -r; dx <= r; dx++)
            for (let dy = -r; dy <= r; dy++)
              for (let dz = -r; dz <= r; dz++) {
                const b = bot.blockAt(o.offset(dx, dy, dz));
                if (b && b.boundingBox === 'block' && b.name !== 'air' && b.name !== 'bedrock' && bot.canDigBlock(b)) {
                  busy = true;
                  bot.dig(b, true).then(() => busy = false).catch(() => busy = false);
                  return;
                }
              }
      });
    }

    // ── SPAM chat (trigger spam filter) ──
    if (C.spam) { let n = 0; every(1000, () => bot.chat('teste anticheat ' + (++n))); }
  });

  bot.on('end', () => { timers.forEach(clearInterval); timers.length = 0; });
};
