/**
 * Servidor de sinalização da Agenda de Tatuagem.
 *
 * Só apresenta os computadores: repassa a oferta, a resposta e os candidatos
 * do WebRTC entre o computador do estúdio (anfitrião) e os que querem se
 * conectar a ele (clientes). Nenhum dado da agenda passa por aqui, e a
 * autorização de cada computador é conferida entre eles, de ponta a ponta.
 *
 * Cada estúdio é uma sala (um Durable Object), encontrada pelo ID do estúdio.
 */
import { DurableObject } from 'cloudflare:workers';

/** 12 caracteres do alfabeto sem 0, 1, I e O, como o aplicativo gera. */
const ID_DO_ESTUDIO = /^[2-9A-HJ-NP-Z]{12}$/;
const MAXIMO_DE_CLIENTES = 16;
const TAMANHO_MAXIMO = 64 * 1024;
const VALIDADE_DO_TURN_S = 24 * 60 * 60;
const CACHE_DO_ICE_MS = 60 * 60 * 1000;
const STUN = [{ urls: ['stun:stun.cloudflare.com:3478'] }];

export default {
  async fetch(pedido, env) {
    const partes = new URL(pedido.url).pathname.split('/').filter(Boolean);
    if (partes.length === 0) {
      return new Response('Agenda de Tatuagem: servidor de sinalização no ar.');
    }
    if (partes.length !== 2 || partes[0] !== 'sala' || !ID_DO_ESTUDIO.test(partes[1])) {
      return new Response('Não encontrado.', { status: 404 });
    }
    if (pedido.headers.get('Upgrade') !== 'websocket') {
      return new Response('Esta rota só aceita WebSocket.', { status: 426 });
    }
    return env.SALAS.get(env.SALAS.idFromName(partes[1])).fetch(pedido);
  },
};

export class Sala extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Responde ao "ping" sem acordar a sala, para as conexões paradas não gastarem nada.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.ice = null;
  }

  async fetch(pedido) {
    const papel = new URL(pedido.url).searchParams.get('papel');
    if (papel !== 'anfitriao' && papel !== 'cliente') {
      return new Response('Informe o papel: anfitriao ou cliente.', { status: 400 });
    }
    const [doCliente, doServidor] = Object.values(new WebSocketPair());

    if (papel === 'anfitriao') {
      // Só passa a valer depois de provar a chave, na mensagem "registrar".
      this.ctx.acceptWebSocket(doServidor, ['anfitriao']);
      doServidor.serializeAttachment({ papel, registrado: false });
      return new Response(null, { status: 101, webSocket: doCliente });
    }

    this.ctx.acceptWebSocket(doServidor, ['cliente']);
    if (!(await this.ctx.storage.get('chave'))) {
      enviar(doServidor, { tipo: 'erro', codigo: 'estudio', mensagem: 'ID do estúdio não encontrado.' });
      doServidor.close(4404, 'estudio');
    } else if (this.ctx.getWebSockets('cliente').length > MAXIMO_DE_CLIENTES) {
      enviar(doServidor, { tipo: 'erro', codigo: 'cheio', mensagem: 'Muitos computadores conectando ao mesmo tempo.' });
      doServidor.close(4429, 'cheio');
    } else {
      const id = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
      doServidor.serializeAttachment({ papel, id });
      enviar(doServidor, { tipo: 'ola', id, anfitriao: this.anfitriao() !== null });
    }
    return new Response(null, { status: 101, webSocket: doCliente });
  }

  async webSocketMessage(ws, texto) {
    if (typeof texto !== 'string' || texto.length > TAMANHO_MAXIMO) return;
    let mensagem;
    try {
      mensagem = JSON.parse(texto);
    } catch {
      return;
    }
    const quem = ws.deserializeAttachment();
    if (!quem) return;

    if (quem.papel === 'anfitriao') {
      if (mensagem.tipo === 'registrar') return this.registrar(ws, mensagem.chave);
      if (!quem.registrado) return;
      if (mensagem.tipo === 'ice') return enviar(ws, { tipo: 'ice', servidores: await this.servidoresIce() });
      if (mensagem.tipo === 'sinal') {
        const destino = this.ctx
          .getWebSockets('cliente')
          .find((c) => c.deserializeAttachment()?.id === mensagem.para);
        if (destino) enviar(destino, { tipo: 'sinal', dados: mensagem.dados });
      }
      return;
    }

    if (mensagem.tipo === 'ice') return enviar(ws, { tipo: 'ice', servidores: await this.servidoresIce() });
    if (mensagem.tipo === 'sinal') {
      const anfitriao = this.anfitriao();
      if (anfitriao) enviar(anfitriao, { tipo: 'sinal', de: quem.id, dados: mensagem.dados });
      else enviar(ws, { tipo: 'anfitriao', online: false });
    }
  }

  async webSocketClose(ws, codigo) {
    this.saiu(ws);
    try {
      ws.close(codigo === 1005 || codigo === 1006 ? 1000 : codigo);
    } catch {
      // Já estava fechado.
    }
  }

  async webSocketError(ws) {
    this.saiu(ws);
  }

  /**
   * O primeiro computador a registrar um ID fica dono dele: guarda-se só o hash
   * da chave, e os registros seguintes precisam apresentar a mesma chave.
   */
  async registrar(ws, chave) {
    if (typeof chave !== 'string' || chave.length < 32 || chave.length > 128) {
      enviar(ws, { tipo: 'erro', codigo: 'chave', mensagem: 'Chave inválida.' });
      return ws.close(4400, 'chave');
    }
    const hash = await sha256(chave);
    const guardado = await this.ctx.storage.get('chave');
    if (!guardado) {
      await this.ctx.storage.put('chave', hash);
    } else if (guardado !== hash) {
      enviar(ws, { tipo: 'erro', codigo: 'chave', mensagem: 'Este ID de estúdio pertence a outro computador.' });
      return ws.close(4403, 'chave');
    }
    // Se o aplicativo reabriu, a conexão antiga do mesmo estúdio é substituída.
    for (const antigo of this.ctx.getWebSockets('anfitriao')) {
      if (antigo !== ws) antigo.close(4000, 'substituido');
    }
    ws.serializeAttachment({ papel: 'anfitriao', registrado: true });
    enviar(ws, { tipo: 'registrado' });
    this.avisarClientes(true);
  }

  saiu(ws) {
    const quem = ws.deserializeAttachment();
    if (quem?.papel === 'anfitriao' && quem.registrado && this.anfitriao(ws) === null) {
      this.avisarClientes(false);
    }
  }

  /** O anfitrião registrado, sem contar a conexão que está saindo. */
  anfitriao(ignorar = null) {
    return (
      this.ctx
        .getWebSockets('anfitriao')
        .find((a) => a !== ignorar && a.deserializeAttachment()?.registrado && a.readyState === 1) ?? null
    );
  }

  avisarClientes(online) {
    for (const cliente of this.ctx.getWebSockets('cliente')) enviar(cliente, { tipo: 'anfitriao', online });
  }

  /**
   * STUN sempre; TURN (relay) quando as chaves da Cloudflare estão configuradas.
   * As credenciais são temporárias e geradas aqui, para a chave nunca ir ao aplicativo.
   */
  async servidoresIce() {
    if (this.ice && this.ice.ate > Date.now()) return this.ice.servidores;
    let servidores = STUN;
    if (this.env.TURN_KEY_ID && this.env.TURN_KEY_API_TOKEN) {
      try {
        const resposta = await fetch(
          `https://rtc.live.cloudflare.com/v1/turn/keys/${this.env.TURN_KEY_ID}/credentials/generate-ice-servers`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.env.TURN_KEY_API_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ttl: VALIDADE_DO_TURN_S }),
          },
        );
        if (resposta.ok) {
          const { iceServers } = await resposta.json();
          const lista = (Array.isArray(iceServers) ? iceServers : [iceServers])
            // Os navegadores bloqueiam a porta 53; deixá-la só atrasa a conexão.
            .map((s) => ({ ...s, urls: [].concat(s.urls).filter((u) => !/:53(\?|$)/.test(u)) }))
            .filter((s) => s.urls.length > 0);
          if (lista.length > 0) servidores = lista;
        } else {
          console.log(`TURN respondeu ${resposta.status}: ${await resposta.text()}`);
        }
      } catch (erro) {
        console.log(`Não foi possível gerar as credenciais do TURN: ${erro}`);
      }
    }
    this.ice = { servidores, ate: Date.now() + CACHE_DO_ICE_MS };
    return servidores;
  }
}

function enviar(ws, mensagem) {
  try {
    ws.send(JSON.stringify(mensagem));
  } catch {
    // A conexão caiu no meio do caminho: quem ficou tenta de novo.
  }
}

async function sha256(texto) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
