const LADO_MAXIMO = 1600;

/** Reduz fotos do celular antes do envio, para o banco não crescer à toa. */
export async function reduzirImagem(arquivo: File): Promise<{ blob: Blob; nome: string }> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    if (escala === 1 && arquivo.size < 600_000) return { blob: arquivo, nome: arquivo.name };

    const tela = document.createElement('canvas');
    tela.width = Math.round(bitmap.width * escala);
    tela.height = Math.round(bitmap.height * escala);
    tela.getContext('2d')!.drawImage(bitmap, 0, 0, tela.width, tela.height);
    const blob = await new Promise<Blob | null>((ok) => tela.toBlob(ok, 'image/jpeg', 0.85));
    if (!blob) return { blob: arquivo, nome: arquivo.name };
    return { blob, nome: arquivo.name.replace(/\.[^.]+$/, '') + '.jpg' };
  } catch {
    return { blob: arquivo, nome: arquivo.name };
  }
}
