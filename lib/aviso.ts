// Aviso de firma electrónica y privacidad: lo acepta quien firma antes de continuar.
// Si cambia el texto, sube la versión: cada firma guarda cuál aceptó.

export const AVISO_V = 'aviso-firma-electronica-v2';
export const AVISO_TITLE = 'Aviso de firma electrónica y privacidad';
export const AVISO_LABEL = 'versión 2 · noviembre 2026';   // lo que se lee; AVISO_V es lo que se guarda

export function avisoSections(ws: string): { h: string; p: string }[] {
  return [
    { h: 'Qué estás aceptando', p: `${ws} te envía este split por medio de Cleared para que lo revises y lo firmes de forma electrónica, en lugar de en papel. Tu firma electrónica es válida entre las partes como una firma autógrafa (Código de Comercio, arts. 89 a 93). Si no estás de acuerdo, no marques la casilla y avísale a quien te mandó el enlace.` },
    { h: 'Cómo se forma tu firma', p: 'Con el enlace personal que solo te llegó a ti, un código de 6 dígitos que te mandamos a tu correo, tu nombre completo escrito y, si quieres, tu firma dibujada. Junto con la fecha, la hora, tu dirección IP, tu navegador y una huella digital (SHA-256) del documento, todo queda en una constancia que va anexa a la carta.' },
    { h: 'Tus copias', p: `Mientras el enlace esté vigente puedes descargar el PDF cuando quieras. Cuando firmen todas las partes te llega por correo una copia con todas las firmas, la constancia y este aviso; guárdala, es tu original. Si quieres una copia impresa, pídesela a ${ws}, sin costo.` },
    { h: 'Si prefieres papel o cambias de opinión', p: `Antes de firmar puedes no aceptar este aviso y usar “Pedir un cambio” para decir que prefieres firmar en papel. Una vez firmado, tu firma no se retira desde aquí; si hay un error, ${ws} puede anular esta versión y mandarte una nueva.` },
    { h: 'Tus datos personales', p: `Para este trámite se usan los datos que aparecen en la carta (nombre, nombre artístico, sociedad de gestión, IPI y editora), tu correo y tu teléfono; al firmar se registran tu dirección IP, tu navegador, la fecha y hora y, si la dibujas, tu firma. Sirven solo para identificarte, integrar la carta con su constancia y mandarte tu copia. Se comparten únicamente con las demás partes de este split y con quienes administran sus derechos (editoras, sociedades de gestión y disquera). El responsable es ${ws}; para acceder, corregir, cancelar u oponerte al uso de tus datos (derechos ARCO), contáctalo.` },
    { h: 'Qué necesitas', p: 'Un navegador actualizado y acceso a tu correo para recibir el código.' },
  ];
}

export const AVISO_CONFIRM = [
  'Puedo leer este aviso y guardarlo o imprimirlo.',
  'Acepto usar documentos y firmas electrónicas para este split.',
  'Sé cómo se usan mis datos para este trámite.',
];

// PDF del aviso para descargar o imprimir
export async function avisoPdf(ws: string): Promise<Blob> {
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
  line(AVISO_TITLE, 17, true, [17, 17, 20], 2);
  line(`${ws} · Cleared · ${AVISO_LABEL}`, 8.5, false, [112, 112, 120], 14);
  for (const s of avisoSections(ws)) { line(s.h, 10.5, true, [17, 17, 20], 2); line(s.p, 9.6, false, [52, 52, 58], 10); }
  line('Al marcar la casilla confirmo que:', 10.5, true, [17, 17, 20], 2);
  for (const c of AVISO_CONFIRM) line('•  ' + c, 9.6);
  return doc.output('blob');
}
