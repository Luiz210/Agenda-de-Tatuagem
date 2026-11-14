/**
 * Transporte da conexão pela internet. Roda numa janela oculta para usar o
 * WebRTC que já vem no Electron, sem instalar nada.
 *
 * Faz três coisas: fala com o servidor de sinalização, abre o canal de dados
 * com o outro computador (direto quando dá, por retransmissão quando não dá) e
 * leva mensagens inteiras de um lado ao outro, em pedaços. Quem decide se o
 * outro lado é confiável é o processo principal: aqui só passam bytes.
 */
(() => {
  const ponte = window.ponte;

  const PEDACO = 16 * 1024;
  const FILA_CHEIA = 1024 * 1024;
  const FILA_BAIXA = 256 * 1024;
  const CORPO_MAXIMO = 40 * 1024 * 1024;
  const PRAZO_PARA_ABRIR_MS = 30_000;
  const TOLERANCIA_A_QUEDA_MS = 8_000;
  const BATIMENTO_MS = 25_000;
  const VALIDADE_DO_ICE_MS = 30 * 60 * 1000;
  const ESPERA_MAXIMA_MS = 30_000;
  const STUN_PADRAO = [{ urls: ['stun:stun.cloudflare.com:3478'] }];
  const ANFITRIAO = 'anfitriao';
  /** Encerramentos da sinalização em que insistir não adianta. */
  const SEM_VOLTA = { 4000: 'substituido', 4400: 'chave', 4403: 'chave', 4404: 'estudio' };

  let config = null;
  let geracao = 0;
  let ws = null;
  let batimento = null;
  let reconexao = null;
  let tentativas = 0;
  let anfitriaoOnline = false;
  let ice = null;
  let esperandoIce = [];
  const pares = new Map();

  const cliente = () => config?.papel === 'cliente';
  const emitir = (evento) => ponte.emitir(evento);

  // ---------- Sinalização ----------

  function conectar() {
    if (!config || ws) return;
    const minha = geracao;
    emitir({ tipo: 'sinalizacao', estado: 'conectando' });
    const s = new WebSocket(`${config.url.replace(/\/+$/, '')}/sala/${config.estudio}?papel=${config.papel}`);
    ws = s;
    s.onopen = () => {
      if (config.papel === 'anfitriao') sinalizar({ tipo: 'registrar', chave: config.chave });
      batimento = setInterval(() => s.readyState === 1 && s.send('ping'), BATIMENTO_MS);
    };
    s.onmessage = (e) => {
      if (minha !== geracao || e.data === 'pong') return;
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      tratarSinal(m).catch(() => {});
    };
    s.onclose = (e) => {
      if (ws !== s) return;
      ws = null;
      clearInterval(batimento);
      anfitriaoOnline = false;
      if (minha !== geracao) return;
      const semVolta = SEM_VOLTA[e.code];
      emitir({ tipo: 'sinalizacao', estado: semVolta ? 'erro' : 'desconectada', motivo: semVolta ?? null });
      // O cliente com o canal aberto não precisa mais da sinalização.
      if (!semVolta && !(cliente() && pares.get(ANFITRIAO)?.aberto)) tentarDeNovo();
    };
    s.onerror = () => {};
  }

  function sinalizar(mensagem) {
    if (ws?.readyState === 1) ws.send(JSON.stringify(mensagem));
  }

  /** Espera cada vez mais entre as tentativas, até meio minuto. */
  function tentarDeNovo() {
    if (!config || reconexao) return;
    const espera = Math.min(ESPERA_MAXIMA_MS, 1000 * 2 ** Math.min(tentativas, 5)) * (0.75 + Math.random() / 2);
    tentativas += 1;
    const minha = geracao;
    reconexao = setTimeout(() => {
      reconexao = null;
      if (minha !== geracao) return;
      if (!ws) conectar();
      else if (cliente() && anfitriaoOnline) void oferecer();
    }, espera);
  }

  async function tratarSinal(m) {
    switch (m.tipo) {
      case 'registrado':
        tentativas = 0;
        emitir({ tipo: 'sinalizacao', estado: 'conectada' });
        break;
      case 'ola':
        anfitriaoOnline = Boolean(m.anfitriao);
        emitir({ tipo: 'sinalizacao', estado: 'conectada', anfitriao: anfitriaoOnline });
        if (anfitriaoOnline) await oferecer();
        break;
      case 'anfitriao':
        anfitriaoOnline = Boolean(m.online);
        emitir({ tipo: 'sinalizacao', estado: 'conectada', anfitriao: anfitriaoOnline });
        if (anfitriaoOnline) await oferecer();
        break;
      case 'ice': {
        ice = { servidores: m.servidores, ate: Date.now() + VALIDADE_DO_ICE_MS };
        const fila = esperandoIce;
        esperandoIce = [];
        fila.forEach((acordar) => acordar());
        break;
      }
      case 'sinal':
        if (cliente()) await sinalDoAnfitriao(m.dados);
        else await sinalDoCliente(String(m.de), m.dados);
        break;
      case 'erro':
        emitir({ tipo: 'sinalizacao', estado: 'erro', motivo: m.codigo });
        break;
    }
  }

  /** Servidores STUN/TURN, pedidos à sinalização. Sem resposta, segue só com o STUN. */
  async function servidoresIce() {
    if (ice && ice.ate > Date.now()) return ice.servidores;
    await new Promise((ok) => {
      const prazo = setTimeout(ok, 5000);
      esperandoIce.push(() => {
        clearTimeout(prazo);
        ok();
      });
      sinalizar({ tipo: 'ice' });
    });
    return ice && ice.ate > Date.now() ? ice.servidores : STUN_PADRAO;
  }

  // ---------- Pares ----------

  function criarPar(id, servidores) {
    const pc = new RTCPeerConnection({ iceServers: servidores });
    const par = { id, pc, canal: null, aberto: false, fila: Promise.resolve(), recebendo: null, candidatos: [], remoto: false };
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const dados = { tipo: 'candidato', candidato: e.candidate.toJSON() };
      sinalizar(cliente() ? { tipo: 'sinal', dados } : { tipo: 'sinal', para: id, dados });
    };
    pc.onconnectionstatechange = () => {
      const estado = pc.connectionState;
      clearTimeout(par.queda);
      if (estado === 'failed' || estado === 'closed') encerrar(par);
      // Uma oscilação da rede pode se resolver sozinha; se não, refaz a conexão.
      else if (estado === 'disconnected') par.queda = setTimeout(() => encerrar(par), TOLERANCIA_A_QUEDA_MS);
    };
    par.prazo = setTimeout(() => !par.aberto && encerrar(par), PRAZO_PARA_ABRIR_MS);
    pares.set(id, par);
    return par;
  }

  function prepararCanal(par, canal) {
    par.canal = canal;
    canal.binaryType = 'arraybuffer';
    canal.bufferedAmountLowThreshold = FILA_BAIXA;
    canal.onopen = () => {
      if (pares.get(par.id) !== par) return;
      par.aberto = true;
      tentativas = 0;
      clearTimeout(par.prazo);
      emitir({
        tipo: 'aberto',
        par: par.id,
        impressoes: { local: impressao(par.pc.localDescription), remoto: impressao(par.pc.remoteDescription) },
      });
      setTimeout(() => void informarCaminho(par), 1500);
      // Com o canal aberto, o cliente solta a sinalização; ela só volta se a conexão cair.
      if (cliente()) setTimeout(() => par.aberto && ws?.close(1000), 4000);
    };
    canal.onmessage = (e) => receber(par, e.data);
    canal.onclose = () => encerrar(par);
  }

  function encerrar(par) {
    if (pares.get(par.id) !== par) return;
    pares.delete(par.id);
    clearTimeout(par.prazo);
    clearTimeout(par.queda);
    try {
      par.canal?.close();
      par.pc.close();
    } catch {
      // Já estava fechado.
    }
    if (par.aberto) emitir({ tipo: 'fechado', par: par.id });
    if (cliente() && config) tentarDeNovo();
  }

  /** A impressão digital do certificado de um dos lados, como aparece na descrição da sessão. */
  function impressao(descricao) {
    const achado = /^a=fingerprint:(\S+) (\S+)/m.exec(descricao?.sdp ?? '');
    return achado ? `${achado[1]} ${achado[2]}`.toLowerCase() : '';
  }

  /** Direto entre os dois computadores ou pelo servidor de retransmissão. */
  async function informarCaminho(par) {
    try {
      const relatorio = await par.pc.getStats();
      let escolhido = null;
      relatorio.forEach((r) => {
        if (r.type === 'transport' && r.selectedCandidatePairId) escolhido = relatorio.get(r.selectedCandidatePairId);
      });
      relatorio.forEach((r) => {
        if (!escolhido && r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') escolhido = r;
      });
      const local = escolhido && relatorio.get(escolhido.localCandidateId);
      const remoto = escolhido && relatorio.get(escolhido.remoteCandidateId);
      if (!local || pares.get(par.id) !== par) return;
      const retransmitido = local.candidateType === 'relay' || remoto?.candidateType === 'relay';
      emitir({ tipo: 'caminho', par: par.id, caminho: retransmitido ? 'retransmitido' : 'direto' });
    } catch {
      // Só informativo.
    }
  }

  async function aplicarCandidatos(par) {
    par.remoto = true;
    for (const candidato of par.candidatos.splice(0)) {
      await par.pc.addIceCandidate(candidato).catch(() => {});
    }
  }

  async function receberCandidato(par, candidato) {
    if (!par) return;
    if (!par.remoto) par.candidatos.push(candidato);
    else await par.pc.addIceCandidate(candidato).catch(() => {});
  }

  // ---------- Cliente: propõe a conexão ----------

  async function oferecer() {
    if (pares.has(ANFITRIAO)) return;
    const minha = geracao;
    // Reserva o lugar antes de esperar, para duas chamadas não abrirem duas conexões.
    pares.set(ANFITRIAO, { reservado: true });
    const servidores = await servidoresIce();
    const reserva = pares.get(ANFITRIAO);
    if (minha !== geracao || !reserva?.reservado) return;
    pares.delete(ANFITRIAO);
    const par = criarPar(ANFITRIAO, servidores);
    prepararCanal(par, par.pc.createDataChannel('agenda', { ordered: true }));
    await par.pc.setLocalDescription(await par.pc.createOffer());
    sinalizar({ tipo: 'sinal', dados: { tipo: 'oferta', sdp: par.pc.localDescription.sdp } });
  }

  async function sinalDoAnfitriao(dados) {
    const par = pares.get(ANFITRIAO);
    if (!par?.pc) return;
    if (dados?.tipo === 'resposta' && !par.remoto) {
      await par.pc.setRemoteDescription({ type: 'answer', sdp: String(dados.sdp) });
      await aplicarCandidatos(par);
    } else if (dados?.tipo === 'candidato') {
      await receberCandidato(par, dados.candidato);
    }
  }

  // ---------- Anfitrião: responde a quem propõe ----------

  async function sinalDoCliente(de, dados) {
    if (dados?.tipo === 'oferta') {
      const antigo = pares.get(de);
      if (antigo) encerrar(antigo);
      const minha = geracao;
      const servidores = await servidoresIce();
      if (minha !== geracao) return;
      const par = criarPar(de, servidores);
      par.pc.ondatachannel = (e) => prepararCanal(par, e.channel);
      await par.pc.setRemoteDescription({ type: 'offer', sdp: String(dados.sdp) });
      await aplicarCandidatos(par);
      await par.pc.setLocalDescription(await par.pc.createAnswer());
      sinalizar({ tipo: 'sinal', para: de, dados: { tipo: 'resposta', sdp: par.pc.localDescription.sdp } });
    } else if (dados?.tipo === 'candidato') {
      await receberCandidato(pares.get(de), dados.candidato);
    }
  }

  // ---------- Mensagens inteiras, em pedaços ----------

  /** Cabeçalho em texto com o tamanho do corpo; depois, o corpo em pedaços binários. */
  function enviar(id, mensagem, corpo) {
    const par = pares.get(id);
    if (!par?.aberto) return;
    // Uma mensagem por vez em cada par, para os pedaços de duas não se misturarem.
    par.fila = par.fila
      .then(async () => {
        const canal = par.canal;
        if (canal.readyState !== 'open') return;
        const bytes = corpo ? new Uint8Array(corpo.buffer ?? corpo, corpo.byteOffset ?? 0, corpo.byteLength) : null;
        canal.send(JSON.stringify({ ...mensagem, _c: bytes ? bytes.byteLength : 0 }));
        for (let i = 0; bytes && i < bytes.byteLength; i += PEDACO) {
          if (canal.bufferedAmount > FILA_CHEIA) await esvaziar(canal);
          if (canal.readyState !== 'open') return;
          canal.send(bytes.slice(i, i + PEDACO));
        }
      })
      .catch(() => encerrar(par));
  }

  function esvaziar(canal) {
    return new Promise((ok) => {
      const pronto = () => {
        clearTimeout(prazo);
        canal.removeEventListener('bufferedamountlow', pronto);
        canal.removeEventListener('close', pronto);
        ok();
      };
      const prazo = setTimeout(pronto, 10_000);
      canal.addEventListener('bufferedamountlow', pronto);
      canal.addEventListener('close', pronto);
    });
  }

  function receber(par, dados) {
    if (typeof dados === 'string') {
      if (par.recebendo) return encerrar(par);
      let mensagem;
      try {
        mensagem = JSON.parse(dados);
      } catch {
        return encerrar(par);
      }
      const total = Number(mensagem._c) || 0;
      delete mensagem._c;
      if (total < 0 || total > CORPO_MAXIMO) return encerrar(par);
      if (total === 0) return emitir({ tipo: 'mensagem', par: par.id, mensagem });
      par.recebendo = { mensagem, corpo: new Uint8Array(total), recebido: 0 };
      return;
    }
    const r = par.recebendo;
    if (!r || r.recebido + dados.byteLength > r.corpo.byteLength) return encerrar(par);
    r.corpo.set(new Uint8Array(dados), r.recebido);
    r.recebido += dados.byteLength;
    if (r.recebido === r.corpo.byteLength) {
      par.recebendo = null;
      emitir({ tipo: 'mensagem', par: par.id, mensagem: r.mensagem, corpo: r.corpo });
    }
  }

  // ---------- Comandos do processo principal ----------

  function parar() {
    geracao += 1;
    config = null;
    clearTimeout(reconexao);
    reconexao = null;
    clearInterval(batimento);
    tentativas = 0;
    ice = null;
    for (const par of [...pares.values()]) {
      pares.delete(par.id);
      clearTimeout(par.prazo);
      clearTimeout(par.queda);
      try {
        par.canal?.close();
        par.pc?.close();
      } catch {
        // Já estava fechado.
      }
      if (par.aberto) emitir({ tipo: 'fechado', par: par.id });
    }
    pares.clear();
    const s = ws;
    ws = null;
    s?.close(1000);
  }

  ponte.aoComando((comando) => {
    switch (comando.tipo) {
      case 'iniciar':
        parar();
        config = comando.config;
        conectar();
        break;
      case 'enviar':
        enviar(comando.par, comando.mensagem, comando.corpo);
        break;
      case 'fechar': {
        const par = pares.get(comando.par);
        if (par?.pc) encerrar(par);
        break;
      }
      case 'parar':
        parar();
        break;
    }
  });

  // A rede voltou: não espera o próximo intervalo para tentar.
  window.addEventListener('online', () => {
    if (!config) return;
    clearTimeout(reconexao);
    reconexao = null;
    tentativas = 0;
    if (!ws && !(cliente() && pares.get(ANFITRIAO)?.aberto)) conectar();
  });

  emitir({ tipo: 'pronta' });
})();
