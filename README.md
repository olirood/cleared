# Cleared

Splits, label copy y firmas para el expediente de cada canción. Piloto privado: Apollo Music (Margarita) y Management de Kevin y Octavio Cuadras.

## Estructura de datos

`supabase/migrations/` define la base completa. Cada cambio de estructura es un archivo nuevo con fecha; nunca se edita uno que ya se aplicó.

- **Espacios y membresías**: cada persona entra a los espacios donde la invitan, con rol owner, admin, operator o viewer.
- **Invitaciones** (`invitations`): solo se puede crear la cuenta de un correo invitado. Al crearse, recibe sus espacios. Una cuenta sin espacio no ve nada, ni el directorio.
- **Directorio compartido** (`people`, `publishers`): un perfil por persona para todos los espacios. Lo edita solo el espacio que lo creó o el que lo representa.
- **Obra y grabación separadas**: el split vive en la obra (`works`); ISRC, label copy, créditos y archivos viven en la grabación (`recordings`). Una obra puede tener versión original, acústica y remix.
- **Splits versionados**: una sola versión vigente por obra. No se envía a firma si no suma 100 % o si falta la aprobación vigente de un espacio representante. Enviado, ya no se edita: se crea otra versión.
- **Firmas**: cada firmante recibe un enlace único (30 días) sin necesidad de cuenta. La base guarda solo la huella del enlace; firmar, ver la carta y pedir cambios pasa por funciones de la base (`signing_view`, `sign_split`, `request_split_change`). Se registra nombre escrito, consentimiento, fecha, IP y navegador.
- **Archivos**: audio y video solo como enlace; portada (original y miniatura) y documentos PDF en el almacén privado `cleared`, en carpetas por espacio.
- **Bitácora**: solo se agrega, nunca se edita.

Todas las tablas tienen seguridad por fila (RLS).

## Sitio

Next.js en Cloudflare Workers (OpenNext). Acceso con correo y contraseña; cada quien cambia la suya en **Cuenta**.

- `app/` páginas: inicio, `tracks` (carpeta y label copy), `splits`, `directorio`, `cuenta` y `firmar/[token]` (pública).
- `lib/` reglas compartidas (splits, carta, label copy, tracks) · `middleware.ts` renueva la sesión y manda a `/login` a quien no la tenga.
- `.env.production` solo trae valores públicos. La clave secreta y la contraseña de la base nunca van al repo.
- El sitio pide a los buscadores no indexarlo y no se puede incrustar en otras páginas.

```
npm install
npm run dev        # local en http://localhost:3000
npm run preview    # igual que en Cloudflare
```

## Probar los permisos

```
npm run test:db
```

Simula a Margarita, a Oliver y a un intruso contra una base Postgres en memoria con todas las migraciones.

## Costo

Planes gratis: Cloudflare (sitio), Supabase (base y acceso), Cloudflare R2 (archivos), Resend (correos).
