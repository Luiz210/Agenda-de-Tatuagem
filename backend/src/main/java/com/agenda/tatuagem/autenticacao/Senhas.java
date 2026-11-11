package com.agenda.tatuagem.autenticacao;

import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/** Hash de senhas e tokens, sem depender de bibliotecas além do próprio Java. */
public final class Senhas {

	private static final String ALGORITMO = "PBKDF2WithHmacSHA256";
	private static final int ITERACOES = 210_000;
	private static final int ITERACOES_PIN = 20_000;
	private static final int BITS = 256;
	private static final SecureRandom ALEATORIO = new SecureRandom();

	private Senhas() {
	}

	public static String gerarHash(String senha) {
		return gerarHash(senha, ITERACOES);
	}

	/**
	 * O PIN é conferido contra todas as pessoas a cada digitação, então usa menos
	 * iterações. Ele só funciona no próprio computador do estúdio e tem limite de tentativas.
	 */
	public static String gerarHashPin(String pin) {
		return gerarHash(pin, ITERACOES_PIN);
	}

	private static String gerarHash(String senha, int iteracoes) {
		byte[] sal = new byte[16];
		ALEATORIO.nextBytes(sal);
		byte[] hash = derivar(senha, sal, iteracoes);
		Base64.Encoder base64 = Base64.getEncoder();
		return iteracoes + ":" + base64.encodeToString(sal) + ":" + base64.encodeToString(hash);
	}

	public static boolean confere(String senha, String armazenado) {
		String[] partes = armazenado.split(":");
		byte[] sal = Base64.getDecoder().decode(partes[1]);
		byte[] esperado = Base64.getDecoder().decode(partes[2]);
		return MessageDigest.isEqual(esperado, derivar(senha, sal, Integer.parseInt(partes[0])));
	}

	static String gerarToken() {
		byte[] bytes = new byte[32];
		ALEATORIO.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	static String hashDoToken(String token) {
		try {
			MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
			return HexFormat.of().formatHex(sha256.digest(token.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
		} catch (GeneralSecurityException e) {
			throw new IllegalStateException(e);
		}
	}

	private static byte[] derivar(String senha, byte[] sal, int iteracoes) {
		try {
			PBEKeySpec chave = new PBEKeySpec(senha.toCharArray(), sal, iteracoes, BITS);
			return SecretKeyFactory.getInstance(ALGORITMO).generateSecret(chave).getEncoded();
		} catch (GeneralSecurityException e) {
			throw new IllegalStateException(e);
		}
	}
}
