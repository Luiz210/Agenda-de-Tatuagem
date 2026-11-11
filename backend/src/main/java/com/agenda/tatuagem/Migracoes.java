package com.agenda.tatuagem;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Ajustes no banco de quem já usava uma versão anterior. O Hibernate cria as
 * colunas novas, mas não afrouxa colunas obrigatórias nem preenche dados antigos.
 * Cada passo pode rodar várias vezes sem efeito.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class Migracoes implements ApplicationRunner {

	private static final Logger LOG = LoggerFactory.getLogger(Migracoes.class);

	private final JdbcTemplate jdbc;

	Migracoes(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public void run(ApplicationArguments args) {
		// O e-mail passou a ser opcional para quem é cadastrado pelo administrador.
		executar("ALTER TABLE USUARIO ALTER COLUMN EMAIL SET NULL");

		// Na primeira versão não havia perfis: quem criou a primeira conta vira administrador.
		executar("UPDATE USUARIO SET PERFIL = 'ADMIN' WHERE ID = (SELECT MIN(ID) FROM USUARIO)"
				+ " AND NOT EXISTS (SELECT 1 FROM USUARIO WHERE PERFIL = 'ADMIN' AND ATIVO = TRUE)");

		// As tatuagens antigas ficam com quem as cadastrou, e as sessões com o responsável da tatuagem.
		executar("UPDATE TATUAGEM SET RESPONSAVEL_ID = CRIADO_POR WHERE RESPONSAVEL_ID IS NULL"
				+ " AND CRIADO_POR IN (SELECT ID FROM USUARIO)");
		executar("UPDATE SESSAO_TATUAGEM S SET RESPONSAVEL_ID = (SELECT T.RESPONSAVEL_ID FROM TATUAGEM T"
				+ " WHERE T.ID = S.TATUAGEM_ID) WHERE S.RESPONSAVEL_ID IS NULL");
	}

	private void executar(String sql) {
		try {
			int linhas = jdbc.update(sql);
			if (linhas > 0) {
				LOG.info("Migração aplicada ({} linhas): {}", linhas, sql);
			}
		} catch (RuntimeException e) {
			LOG.warn("Migração ignorada: {} ({})", sql, e.getMessage());
		}
	}
}
