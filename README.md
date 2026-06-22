# Bots

Joga vários bots de Minecraft num servidor de uma vez. Cada bot conecta sozinho, reconecta se cair, e dá pra ligar cheats (fly, killaura, nuker etc) pra testar se o anticheat pega.

## Pra rodar

Precisa de [Node.js](https://nodejs.org).

```bash
npm install
node index.js
```

No Windows dá pra clicar no `LIGAR.bat`.

## Antes de ligar — mexe no `config.json`

Três coisas que você TEM que trocar:

1. **`host` e `port`** — o IP e a porta do servidor que você vai entrar.
   ```json
   "host": "mc.seuservidor.net",
   "port": 25565,
   ```

2. **`nicks`** — apaga os `SeuNick1/2/3` de exemplo e bota os nicks que você quer usar. Um por linha, quantos quiser.
   ```json
   "nicks": ["Fulano", "Ciclano", "Beltrano"],
   ```

3. **Um servidor com anticheat** o sentido disso é jogar os bots contra um anticheat (tipo Vulcan, Grim, Matrix...) e ver o que ele pega. Sem anticheat os bots só ficam de AFK.

`version` é a versão do servidor (ex `1.21.4`). Bate a versão certa senão não conecta.

## Cheats

Tudo no bloco `cheats` do config. Liga/desliga com `true`/`false`:

`fly`, `speed`, `killaura`, `reach`, `triggerbot`, `criticals`, `velocity`, `nuker`, `nofall`, `timer`, `antivoid`, `antihunger`.

Liga só os que quiser. Com todos ligados o anticheat banna rápido — que é o ponto do teste.

## Proxy (opcional)

Dá pra mandar os bots por proxy SOCKS5 (se o server limita conexões por IP). Cria um `top.txt` com uma proxy por linha (`host:porta` ou `host:porta:user:senha`) e liga `proxyPool.enabled`. Sem proxy ele conecta direto, funciona igual.

## Aviso

O conteúdo e as ferramentas disponibilizadas neste material
destinam-se **exclusivamente** a fins educacionais, acadêmicos e de pesquisa.

Não há incentivo à prática de atividades ilegais, invasões não autorizadas
ou qualquer conduta que viole leis, normas ou políticas de segurança,
incluindo as do Discord ou de qualquer outra organização, seja ela pública
ou privada.

O usuário é o único responsável pelo uso das ferramentas, devendo garantir
que sua utilização ocorra apenas em ambientes próprios ou mediante
autorização expressa.

O autor não se responsabiliza por quaisquer danos diretos ou indiretos,
prejuízos, sanções legais ou consequências decorrentes do uso indevido
do conteúdo apresentado.
