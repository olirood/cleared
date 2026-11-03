// Aviso de firma electrónica y privacidad, en español e inglés. Lo acepta quien firma antes de continuar.
// Si cambia el texto, sube la versión: cada firma guarda cuál aceptó (y en qué idioma).

export type Lang = 'es' | 'en';

type Aviso = { v: string; title: string; label: string; confirmHead: string; confirm: string[]; sections: (ws: string) => { h: string; p: string }[] };

export const AVISOS: Record<Lang, Aviso> = {
  es: {
    v: 'aviso-firma-electronica-v2',
    title: 'Aviso de firma electrónica y privacidad',
    label: 'versión 2 · noviembre 2026',
    confirmHead: 'Al aceptar confirmo que',
    confirm: ['Puedo leer este aviso y guardarlo o imprimirlo.', 'Acepto usar documentos y firmas electrónicas para este split.', 'Sé cómo se usan mis datos para este trámite.'],
    sections: (ws) => [
      { h: 'Qué estás aceptando', p: `${ws} te envía este split por medio de Cleared para que lo revises y lo firmes de forma electrónica, en lugar de en papel. Tu firma electrónica es válida entre las partes como una firma autógrafa (Código de Comercio, arts. 89 a 93). Si no estás de acuerdo, no marques la casilla y avísale a quien te mandó el enlace.` },
      { h: 'Cómo se forma tu firma', p: 'Con el enlace personal que solo te llegó a ti, un código de 6 dígitos que te mandamos a tu correo, tu nombre completo escrito y, si quieres, tu firma dibujada. Junto con la fecha, la hora, tu dirección IP, tu navegador y una huella digital (SHA-256) del documento, todo queda en una constancia de firma que acompaña a la carta.' },
      { h: 'Tus copias', p: `Mientras el enlace esté vigente puedes descargar la carta cuando quieras. Cuando firmen todas las partes te llegan por correo la carta con todas las firmas y la constancia de firma, que incluye este aviso; guárdalas, son tu original. Si quieres una copia impresa, pídesela a ${ws}, sin costo.` },
      { h: 'Si algo está mal', p: `Antes de firmar puedes usar “Pedir un cambio” para avisar qué hay que corregir. Una vez firmado, tu firma no se retira desde aquí; si hay un error, ${ws} puede anular esta versión y mandarte una nueva.` },
      { h: 'Tus datos personales', p: `Para este trámite se usan los datos que aparecen en la carta (nombre, nombre artístico, sociedad de gestión, IPI y editora), tu correo y tu teléfono; al firmar se registran tu dirección IP, tu navegador, la fecha y hora y, si la dibujas, tu firma. Sirven solo para identificarte, integrar la carta con su constancia y mandarte tu copia. Se comparten únicamente con las demás partes de este split y con quienes administran sus derechos (editoras, sociedades de gestión y disquera). El responsable es ${ws}; para acceder, corregir, cancelar u oponerte al uso de tus datos (derechos ARCO), contáctalo.` },
      { h: 'Qué necesitas', p: 'Un navegador actualizado y acceso a tu correo para recibir el código.' },
    ],
  },
  en: {
    v: 'aviso-firma-electronica-v2-en',
    title: 'Electronic Signature and Privacy Notice',
    label: 'version 2 · November 2026',
    confirmHead: 'By accepting I confirm that',
    confirm: ['I can read this notice and save or print it.', 'I agree to use electronic documents and signatures for this split.', 'I understand how my data is used for this process.'],
    sections: (ws) => [
      { h: 'What you are agreeing to', p: `${ws} is sending you this split through Cleared so you can review it and sign it electronically instead of on paper. Under Mexican law your electronic signature is valid between the parties just like a handwritten one (Commercial Code, arts. 89 to 93). If you do not agree, do not check the box and let the person who sent you the link know.` },
      { h: 'How your signature is formed', p: 'With the personal link that was sent only to you, a 6-digit code we email to you, your full name typed in and, if you like, your drawn signature. Together with the date, time, your IP address, your browser and a digital fingerprint (SHA-256) of the document, everything is recorded in a signing certificate that accompanies the letter.' },
      { h: 'Your copies', p: `While the link is active you can download the letter at any time. Once all parties have signed you will receive by email the letter with every signature and the signing certificate, which includes this notice; keep them, they are your originals. If you would like a printed copy, ask ${ws}; there is no charge.` },
      { h: 'If something is wrong', p: `Before signing you can use “Request a change” to say what needs to be fixed. Once signed, your signature cannot be withdrawn here; if there is an error, ${ws} can void this version and send you a new one.` },
      { h: 'Your personal data', p: `For this process we use the details shown in the letter (name, artist name, performing rights organization, IPI and publisher), your email and your phone number; when you sign we record your IP address, browser, date and time and, if you draw it, your signature. They are used only to identify you, complete the letter and its certificate, and send you your copy. They are shared only with the other parties to this split and with those who administer their rights (publishers, performing rights organizations and record label). ${ws} is responsible for this data; to access, correct, cancel or object to its use (ARCO rights under Mexican law), contact them.` },
      { h: 'What you need', p: 'An up-to-date web browser and access to your email to receive the code.' },
    ],
  },
};

// a qué aviso corresponde una versión guardada en la firma
export const avisoByVersion = (v: string | null | undefined) => (Object.entries(AVISOS) as [Lang, Aviso][]).find(([, a]) => a.v === v);

// compatibilidad con lo anterior (español)
export const AVISO_V = AVISOS.es.v;

// PDF del aviso para descargar o imprimir
export async function avisoPdf(ws: string, lang: Lang = 'es'): Promise<Blob> {
  const A = AVISOS[lang];
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 64, CW = W - 2 * M;
  let y = 72;
  const line = (txt: string, size: number, bold = false, color: [number, number, number] = [52, 52, 58], gap = 6) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color);
    const ls = doc.splitTextToSize(txt, CW) as string[];
    for (const l of ls) { if (y > H - 64) { doc.addPage(); y = 64; } doc.text(l, M, y); y += size * 1.45; }
    y += gap;
  };
  line(A.title, 17, true, [17, 17, 20], 2);
  line(`${ws} · Cleared · ${A.label}`, 8.5, false, [112, 112, 120], 14);
  for (const s of A.sections(ws)) { line(s.h, 10.5, true, [17, 17, 20], 2); line(s.p, 9.6, false, [52, 52, 58], 10); }
  line(A.confirmHead + ':', 10.5, true, [17, 17, 20], 2);
  for (const c of A.confirm) line('•  ' + c, 9.6);
  return doc.output('blob');
}
