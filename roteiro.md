# Roteiro do vídeo — afk-bots (versão hype)

> Vibe: rápido, energia alta, fala curta. Mostra mais, explica menos.
> Tempo alvo: 3–5 min. Corte seco entre as partes (sem enrolação).
> Avisar 1x, rápido, que é servidor próprio (teste de anticheat). Não dá aula.

---

## 🎬 GANCHO (0–10s) — segura o cara

**[FALA]** "Eu fiz um exército de bot pra atacar meu próprio anticheat. Olha o que aconteceu."

**[TELA]** Corte direto pro terminal com vários bots conectando de uma vez (a caixa colorida acendendo). Som de "tum" quando entram.

> Sem intro, sem "fala galera". Já joga o gancho.

---

## ⚡ O SETUP (10–30s) — rápido

**[FALA]** "26 bots. Cada um com cheat ligado. Fly, killaura, nuker, criticals, velocity, o pacote completo. E do outro lado: o Vulcan, meu anticheat. Vamo ver quem ganha."

**[TELA]** Passa rápido pelo `config.json` (só mostra a lista de nicks descendo + os cheats `true`). Zoom rápido. NÃO lê item por item.

---

## 💥 O ATAQUE (30s–1:30) — o clímax

**[FALA]** (reagindo ao vivo) "Conectou... conectou... TÁ TODO MUNDO DENTRO. Liga os cheat... e agora—"

**[TELA]** Painel ao vivo. Os ✅ enchendo. Cheats ON.

**[FALA]** "BANIU. Banido. Esse aqui também. Olha a velocidade." (apontar os 🛑 aparecendo + o cronômetro `ban X.Xs`)

**[TELA]** Foco nos 🛑 surgindo um atrás do outro + o tempo de detecção. Esse é O momento. Deixa respirar.

---

## 🔁 O LOOP (1:30–2:15) — o gancho secundário

**[FALA]** "Aí eu pensei: e se eu der unban? Ele volta. E toma ban de novo. E de novo. Olha isso."

**[TELA]** Dá unban no server → bot re-entra em segundos → 🛑 de novo. Mostra o loop acontecendo. Acelera o vídeo (timelapse) se quiser.

**[FALA]** "Anticheat 1, bot infinito 0."

---

## 🧠 O PULO DO GATO (2:15–3:00) — 1 detalhe só, o mais legal

**[FALA]** "Tem UM detalhe técnico que quase me quebrou: na versão nova do Minecraft, o jeito que você manda movimento mudou. Se você faz do jeito antigo, o servidor te ignora. Tive que detectar a versão e montar o packet certo na hora. Resolvido isso, os cheat passaram a funcionar."

**[TELA]** Flash rápido no `cheats.js` (a parte do `usesFlags`). 5 segundos. Não explica linha por linha — só "isso aqui foi o segredo".

> Escolhe 1 detalhe técnico pra parecer esperto. O resto não precisa.

---

## 📊 O PLACAR (3:00–3:30)

**[FALA]** "No fim: tantos bans, detecção mais rápida em X segundos. Tudo registrado."

**[TELA]** Dá Ctrl+C → aparece o RELATÓRIO (bans, tempo min/med/max, lista). Tela limpa, fica bonito.

---

## 🎯 FECHAMENTO (3:30–4:00)

**[FALA]** "Resumindo: 26 bot, cheat no talo, e o anticheat segurou tudo. No meu próprio server, só pra testar. Se quiser que eu solte o código ou faça mais teste, comenta. Falou."

**[TELA]** Painel rodando + um corte final no relatório.

---

## 🎥 Dicas de gravação (pra ficar animado)
- **Corte seco.** Nada de "agora eu vou abrir tal arquivo". Já mostra.
- **Reage ao vivo** nos bans — é o que prende. Voz pra cima.
- **Música** com batida nos momentos de ban (drop quando vários banem juntos).
- **Zoom/destaque** nos 🛑 e no cronômetro.
- Terminal grande, fundo escuro, fonte gorda. Cor ANSI brilha.
- Acelera (timelapse) as partes lentas (conexão, reconnect).
- Texto na tela nos momentos chave: "26 BOTS", "BANIDO EM 3s", "ELE VOLTA?".

## ❌ O que NÃO fazer
- Não explicar proxy, backoff, pool, classify — ninguém liga, mata o ritmo.
- Não ler config item por item.
- Não começar com intro longa.
- 1 detalhe técnico só (o do packet). Resto é show.
