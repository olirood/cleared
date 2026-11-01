# Cleared

Splits, label copy y firmas para el expediente de cada canción. Piloto privado: Apollo Music (Margarita) y Management de Kevin y Octavio Cuadras.

## Estructura de datos

`supabase/migrations/` define la base completa. Cada cambio de estructura es un archivo nuevo con fecha; nunca se edita uno que ya se aplicó.

- **Espacios y membresías**: cada persona entra a los espacios donde la invitan, con rol owner, admin, operator o viewer.
- **Directorio compartido** (`people`, `publishers`): un perfil por persona para todos los espacios. Lo edita solo el espacio que lo creó o el que lo representa.
- **Obra y grabación separadas**: el split vive en la obra (`works`); ISRC, label copy, créditos y archivos viven en la grabación (`recordings`). Una obra puede tener versión original, acústica y remix.
- **Splits versionados**: una sola versión vigente por obra. No se envía a firma si no suma 100 % o si falta la aprobación vigente de un espacio representante. Enviado, ya no se edita: se crea otra versión.
- **Firmas**: el link de firma se guarda solo como huella y nadie lo puede leer desde la app.
- **Bitácora**: solo se agrega, nunca se edita.

Todas las tablas tienen seguridad por fila (RLS).

## Probar los permisos

```
cd supabase/tests && npm i @electric-sql/pglite@0.2.17 && node permissions.test.mjs
```

Simula a Margarita, a Oliver y a un usuario externo contra una base Postgres en memoria.

## Costo

Planes gratis: Cloudflare (sitio), Supabase (base y acceso), Cloudflare R2 (archivos), Resend (correos).
