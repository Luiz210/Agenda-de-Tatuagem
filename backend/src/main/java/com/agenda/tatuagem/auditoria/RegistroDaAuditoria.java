package com.agenda.tatuagem.auditoria;

import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.hibernate.event.service.spi.EventListenerRegistry;
import org.hibernate.event.spi.EventType;
import org.springframework.stereotype.Component;

import jakarta.persistence.EntityManagerFactory;

/** Liga o {@link OuvinteDeAlteracoes} ao Hibernate quando o aplicativo sobe. */
@Component
class RegistroDaAuditoria {

	RegistroDaAuditoria(EntityManagerFactory fabrica, OuvinteDeAlteracoes ouvinte) {
		EventListenerRegistry registro = fabrica.unwrap(SessionFactoryImplementor.class)
				.getEventEngine()
				.getListenerRegistry();
		registro.appendListeners(EventType.POST_INSERT, ouvinte);
		registro.appendListeners(EventType.POST_UPDATE, ouvinte);
		registro.appendListeners(EventType.POST_DELETE, ouvinte);
	}
}
