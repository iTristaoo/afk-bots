# Arquitetura — afk-bots

Bots Minecraft headless (mineflayer) que conectam num servidor próprio para **testar o anticheat (Vulcan)**. Cada bot pode rodar um conjunto de cheats estilo Meteor; o objetivo é validar que o anticheat detecta e bane.

## Fluxo geral

```
                         config.json
                  (host, nicks, cheats, proxy)
                              │
                              ▼
        ┌─────────────────────────────────────────────┐
        │                  index.js                    │
        │  loop de bots · reconnect · resumo 10s       │
        └─────────────────────────────────────────────┘
                              │
              dispara TODOS juntos (spawnDelayMs = 0)
                              │
        ┌────────────┬────────────┬────────────┬───────┐
        ▼            ▼            ▼            ▼
     bot #1       bot #2       bot #3       bot #N
   (mineflayer) (mineflayer) (mineflayer) (mineflayer)
        │            │            │            │
        ▼            ▼            ▼            ▼
   ┌─────────────────────────────────────────────┐
   │            proxypool.js (SOCKS5)             │
   │  per-nick > pool (top.txt) > global > direto │
   │  health-check no boot · round-robin · descarte│
   └─────────────────────────────────────────────┘
        │            │            │            │
        └────────────┴─────┬──────┴────────────┘
                           ▼
              ┌─────────────────────────┐
              │   Servidor Minecraft    │
              │   mc.seuservidor.net    │
              │   ┌───────────────────┐ │
              │   │  Anticheat VULCAN │ │
              │   └───────────────────┘ │
              └─────────────────────────┘
                           │
              detecta cheat → KICK/BAN
                           │
                           ▼
              index.js classifica o motivo
        (ANTICHEAT / BAN / NET / DISCORD / THROTTLE)
                           │
                           ▼
           cronômetro spawn→ban + resumo no painel
```

## Componentes

| Arquivo | Papel |
|---------|-------|
| `index.js` | Sobe os bots, reconecta com backoff, classifica kicks, desenha o painel. |
| `cheats.js` | Harness de cheats (fly, speed, killaura, reach, nuker, nofall, timer, antivoid, triggerbot). Liga por `config.cheats`. |
| `proxypool.js` | Testa e gerencia pool de proxies SOCKS5; descarta proxy morto e pega outro. |
| `config.json` | Toda a config: servidor, nicks, proxies, cheats, timings. |
| `top.txt` | Lista de proxies candidatos (host:port). |

## Detalhes técnicos que valem citar no vídeo

- **Packets de movimento 1.21.4+**: o campo `onGround` virou `flags:MovementFlags` (bitflags). `cheats.js` detecta em runtime via `minecraft-data(bot.version)` e monta o payload certo. Sem isso o servidor recusa os packets.
- **Conexão simultânea**: `spawnDelayMs = 0` faz todos os bots dispararem juntos, em vez de um de cada vez. Cada bot cheata por conta própria ao spawnar.
- **Resiliência**: backoff exponencial no reconnect, descarte de proxy morto, classificação do motivo do kick com cronômetro spawn→detecção.
- **Por-nick proxy**: cada nick pode ter o próprio IP SOCKS5 (parecer jogadores diferentes).
