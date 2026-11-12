package com.agenda.tatuagem.financeiro;

import java.io.IOException;
import java.time.LocalDate;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.agenda.tatuagem.autenticacao.UsuarioAtual;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.AluguelDados;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.AluguelMes;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.Atraso;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.Baixa;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.CompraDados;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.CompraDetalhe;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.CompraResumo;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.ContaDados;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.ContaResumo;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.EntradaDados;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.LancamentoResumo;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.Resumo;

/** O financeiro do estúdio. Cada serviço confere se quem pede é administrador. */
@RestController
@RequestMapping("financeiro")
public class FinanceiroController {

	private final CaixaService caixa;
	private final ContasService contas;
	private final AlugueisService alugueis;

	FinanceiroController(CaixaService caixa, ContasService contas, AlugueisService alugueis) {
		this.caixa = caixa;
		this.contas = contas;
		this.alugueis = alugueis;
	}

	// ---------- Resumo ----------

	@GetMapping("resumo")
	@Transactional(readOnly = true)
	public Resumo resumo() {
		UsuarioAtual.exigirAdmin();
		LocalDate inicio = LocalDate.now().withDayOfMonth(1);
		LocalDate fim = inicio.plusMonths(1).minusDays(1);
		return new Resumo(caixa.saldo(), caixa.soma(TipoLancamento.ENTRADA, inicio, fim, true),
				caixa.soma(TipoLancamento.SAIDA, inicio, fim, true),
				caixa.soma(TipoLancamento.ENTRADA, null, null, false).add(alugueis.emAberto()), contas.aPagarAte(fim),
				contas.proximas(8), alugueis.atrasados(), caixa.ultimos(8));
	}

	// ---------- Contas ----------

	@GetMapping("contas")
	public List<ContaResumo> contas(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate mes) {
		return contas.contas(mes);
	}

	@PostMapping("contas")
	public ContaResumo criarConta(@RequestBody ContaDados dados) {
		return contas.criarConta(dados);
	}

	@PutMapping("contas/{id}")
	public ContaResumo alterarConta(@PathVariable Long id, @RequestBody ContaDados dados) {
		return contas.alterarConta(id, dados);
	}

	@DeleteMapping("contas/{id}")
	public ResponseEntity<Void> excluirConta(@PathVariable Long id) {
		contas.excluirConta(id);
		return ResponseEntity.noContent().build();
	}

	@PutMapping("contas/{id}/foto")
	public ContaResumo trocarFoto(@PathVariable Long id, @RequestParam("arquivo") MultipartFile arquivo)
			throws IOException {
		return contas.trocarFoto(id, arquivo.getOriginalFilename(), arquivo.getContentType(), arquivo.getBytes());
	}

	@PutMapping("contas/{id}/comprovante")
	public ContaResumo trocarComprovante(@PathVariable Long id, @RequestParam("arquivo") MultipartFile arquivo)
			throws IOException {
		return contas.trocarComprovante(id, arquivo.getOriginalFilename(), arquivo.getContentType(),
				arquivo.getBytes());
	}

	/** Baixa com o comprovante opcional, num formulário só. */
	@PostMapping("contas/{id}/pagamento")
	public ContaResumo pagar(@PathVariable Long id,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate data,
			@RequestParam(required = false) String forma,
			@RequestParam(name = "arquivo", required = false) MultipartFile arquivo) throws IOException {
		boolean temArquivo = arquivo != null && !arquivo.isEmpty();
		return contas.pagar(id, new Baixa(data, forma), temArquivo ? arquivo.getOriginalFilename() : null,
				temArquivo ? arquivo.getContentType() : null, temArquivo ? arquivo.getBytes() : null);
	}

	@DeleteMapping("contas/{id}/pagamento")
	public ContaResumo desfazerPagamento(@PathVariable Long id) {
		return contas.desfazerPagamento(id);
	}

	// ---------- Compras ----------

	@GetMapping("compras")
	public List<CompraResumo> compras() {
		return contas.compras();
	}

	@GetMapping("compras/{id}")
	public CompraDetalhe compra(@PathVariable Long id) {
		return contas.compra(id);
	}

	@PostMapping("compras")
	public CompraDetalhe criarCompra(@RequestBody CompraDados dados) {
		return contas.criarCompra(dados);
	}

	@PutMapping("compras/{id}")
	public CompraDetalhe alterarCompra(@PathVariable Long id, @RequestBody CompraDados dados) {
		return contas.alterarCompra(id, dados);
	}

	@DeleteMapping("compras/{id}")
	public ResponseEntity<Void> excluirCompra(@PathVariable Long id) {
		contas.excluirCompra(id);
		return ResponseEntity.noContent().build();
	}

	@PutMapping("compras/{id}/comprovante")
	public CompraResumo trocarComprovanteDaCompra(@PathVariable Long id,
			@RequestParam("arquivo") MultipartFile arquivo) throws IOException {
		return contas.trocarComprovanteDaCompra(id, arquivo.getOriginalFilename(), arquivo.getContentType(),
				arquivo.getBytes());
	}

	// ---------- Aluguéis ----------

	@GetMapping("alugueis")
	public List<AluguelMes> alugueis(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate mes) {
		return alugueis.doMes(mes);
	}

	@GetMapping("alugueis/atrasados")
	public List<Atraso> atrasados() {
		UsuarioAtual.exigirAdmin();
		return alugueis.atrasados();
	}

	@PostMapping("alugueis")
	public AluguelMes receberAluguel(@RequestBody AluguelDados dados) {
		return alugueis.receber(dados);
	}

	@DeleteMapping("alugueis/{id}")
	public ResponseEntity<Void> desfazerAluguel(@PathVariable Long id) {
		alugueis.desfazer(id);
		return ResponseEntity.noContent().build();
	}

	// ---------- Entradas ----------

	@GetMapping("lancamentos")
	public List<LancamentoResumo> lancamentos(
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate mes) {
		return caixa.lancamentos(mes);
	}

	@GetMapping("a-receber")
	public List<LancamentoResumo> aReceber() {
		return caixa.aReceber();
	}

	@PostMapping("entradas")
	public LancamentoResumo lancarEntrada(@RequestBody EntradaDados dados) {
		return caixa.lancarEntrada(dados);
	}

	@PutMapping("entradas/{id}/recebimento")
	public LancamentoResumo receber(@PathVariable Long id, @RequestBody(required = false) Baixa baixa) {
		return caixa.receber(id, baixa != null ? baixa.data() : null);
	}

	@DeleteMapping("entradas/{id}")
	public ResponseEntity<Void> removerEntrada(@PathVariable Long id) {
		caixa.removerAvulso(id);
		return ResponseEntity.noContent().build();
	}
}
