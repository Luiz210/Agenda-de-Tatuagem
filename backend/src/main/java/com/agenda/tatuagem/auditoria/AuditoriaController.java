package com.agenda.tatuagem.auditoria;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.agenda.tatuagem.autenticacao.UsuarioAtual;

import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;

/** O histórico de alterações. Só administradores consultam. */
@RestController
public class AuditoriaController {

	private static final int POR_PAGINA = 100;

	public record Registro(Long id, LocalDateTime dataHora, Long usuarioId, String usuarioNome, String origem,
			String acao, String entidade, Long registroId, String detalhes) {
	}

	private final EntityManager em;

	AuditoriaController(EntityManager em) {
		this.em = em;
	}

	@GetMapping("auditoria")
	@Transactional(readOnly = true)
	public List<Registro> listar(@RequestParam(required = false) String entidade,
			@RequestParam(required = false) Long registroId, @RequestParam(required = false) Long usuarioId,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate inicio,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fim,
			@RequestParam(defaultValue = "0") int pagina) {
		UsuarioAtual.exigirAdmin();
		StringBuilder jpql = new StringBuilder("select a from Auditoria a where 1 = 1");
		if (entidade != null && !entidade.isBlank()) {
			jpql.append(" and a.entidade = :entidade");
		}
		if (registroId != null) {
			jpql.append(" and a.registroId = :registroId");
		}
		if (usuarioId != null) {
			jpql.append(" and a.usuarioId = :usuarioId");
		}
		if (inicio != null) {
			jpql.append(" and a.dataHora >= :inicio");
		}
		if (fim != null) {
			jpql.append(" and a.dataHora < :fim");
		}
		jpql.append(" order by a.dataHora desc, a.id desc");

		TypedQuery<Auditoria> consulta = em.createQuery(jpql.toString(), Auditoria.class);
		if (entidade != null && !entidade.isBlank()) {
			consulta.setParameter("entidade", entidade);
		}
		if (registroId != null) {
			consulta.setParameter("registroId", registroId);
		}
		if (usuarioId != null) {
			consulta.setParameter("usuarioId", usuarioId);
		}
		if (inicio != null) {
			consulta.setParameter("inicio", inicio.atStartOfDay());
		}
		if (fim != null) {
			consulta.setParameter("fim", fim.plusDays(1).atStartOfDay());
		}
		return consulta.setFirstResult(Math.max(0, pagina) * POR_PAGINA)
				.setMaxResults(POR_PAGINA)
				.getResultStream()
				.map(a -> new Registro(a.getId(), a.getDataHora(), a.getUsuarioId(), a.getUsuarioNome(),
						a.getOrigem(), a.getAcao(), a.getEntidade(), a.getRegistroId(), a.getDetalhes()))
				.toList();
	}
}
