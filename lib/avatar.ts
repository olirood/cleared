// Colores para el círculo de la inicial (se ven bien en claro y oscuro)
export const AVATAR_COLORS: [string, string][] = [
  ['#E5484D', 'Rojo'], ['#F76B15', 'Naranja'], ['#FFB224', 'Ámbar'], ['#30A46C', 'Verde'], ['#12A594', 'Turquesa'],
  ['#0090FF', 'Azul'], ['#3E63DD', 'Índigo'], ['#8E4EC6', 'Violeta'], ['#D6409F', 'Rosa'], ['#8D8D86', 'Gris'],
];
// texto oscuro sobre colores claros, blanco sobre el resto
export const avatarInk = (hex: string) => {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 165 ? '#1A1A1A' : '#FFFFFF';
};
export const initialsOf = (name: string) => name.split(/[\s@.]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '·';
