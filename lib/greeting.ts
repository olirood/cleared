// Saludo del inicio: cambia con la hora, el día de la semana y días especiales (hora de CDMX).
// Se elige igual todo el día (no "brinca" al recargar), pero cambia de un día a otro.

const TZ = 'America/Mexico_City';

export function nowInMexico(d = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short' })
    .formatToParts(d).map((p) => [p.type, p.value]));
  return { ymd: `${parts.year}-${parts.month}-${parts.day}`, md: `${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24, weekday: parts.weekday as string };
}

export function longDate(d = new Date()) {
  const s = d.toLocaleDateString('es-MX', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
  return s[0].toUpperCase() + s.slice(1);
}

// días entre hoy (CDMX) y una fecha AAAA-MM-DD
export function daysUntil(ymd: string, today = nowInMexico().ymd) {
  return Math.round((Date.parse(ymd + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000);
}

const SPECIAL: Record<string, string[]> = {
  '01-01': ['Feliz año nuevo, {n}', 'Arrancamos el año, {n}'],
  '01-06': ['Feliz Día de Reyes, {n}'],
  '02-14': ['Feliz 14 de febrero, {n}'],
  '06-21': ['Feliz Día de la Música, {n}'],
  '09-15': ['¡Viva México, {n}!'],
  '09-16': ['¡Viva México, {n}!'],
  '10-31': ['Feliz Halloween, {n}'],
  '11-01': ['Feliz Día de Muertos, {n}'],
  '11-02': ['Feliz Día de Muertos, {n}'],
  '11-22': ['Feliz Día del Músico, {n}', 'Feliz Santa Cecilia, {n}'],
  '12-12': ['Feliz 12 de diciembre, {n}'],
  '12-24': ['Feliz Nochebuena, {n}'],
  '12-25': ['Feliz Navidad, {n}'],
  '12-31': ['Último día del año, {n}', 'Cerramos el año, {n}'],
};

const BY_HOUR: [number, number, string[]][] = [
  [5, 12, ['Buenos días, {n}', 'Buen día, {n}', 'Arrancamos, {n}', 'Buenos días, {n}. ¿Café?']],
  [12, 19, ['Buenas tardes, {n}', '¿Qué hay, {n}?', 'Hola de nuevo, {n}', 'Buenas tardes, {n}. Vamos con todo']],
  [19, 24, ['Buenas noches, {n}', 'Hola, {n}', 'Cerrando el día, {n}']],
  [0, 5, ['Trabajando tarde, {n}', 'Desvelada productiva, {n}', 'Hola, {n}. Ya es tarde']],
];

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function greeting(name: string, d = new Date()) {
  const n = name.trim().split(/\s+/)[0] || '';
  const { ymd, md, hour, weekday } = nowInMexico(d);
  let options = SPECIAL[md];
  if (!options) {
    options = BY_HOUR.find(([a, b]) => hour >= a && hour < b)![2];
    // toques del día de la semana, de día
    if (hour >= 5 && hour < 19) {
      if (weekday === 'Mon') options = [...options, 'Buen inicio de semana, {n}'];
      if (weekday === 'Fri') options = ['Feliz viernes, {n}', ...options];
      if (weekday === 'Sat' || weekday === 'Sun') options = ['Buen fin de semana, {n}', ...options];
    }
  }
  const pick = options[hash(ymd + Math.floor(hour / 6)) % options.length];
  return n ? pick.replace('{n}', n) : pick.replace(/,? \{n\}/, '').replace('{n}', '');
}
