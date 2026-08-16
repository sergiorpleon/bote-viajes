# El Bote — bote de viajes

App para llevar el fondo común de un viaje: quién ha aportado, en qué se ha
gastado, quién debe a quién, y un conversor entre dos monedas.

Empezó como un artifact de Claude y se ha portado a una app Vite + React que se
puede publicar en cualquier hosting estático.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # genera dist/
npm run preview  # sirve dist/ en http://localhost:4173
```

## Los dos modos de almacenamiento

El artifact original usaba `window.storage`, que solo existe dentro de
claude.ai. En su lugar hay dos backends en `src/storage.js`, y el que se usa
depende de si están definidas las variables de entorno:

| Variables            | Backend        | Qué implica                                                        |
| -------------------- | -------------- | ------------------------------------------------------------------ |
| ninguna (por defecto) | `localStorage` | Funciona sin configurar nada, pero cada navegador tiene su propio bote. |
| `VITE_SUPABASE_*`    | Supabase REST  | Todo el mundo que abra el enlace ve y edita el mismo bote.          |

La app lo indica en un aviso en la pantalla de inicio, así que no hay duda de en
qué modo está corriendo.

### Activar el bote compartido

1. Crea un proyecto en [supabase.com](https://supabase.com) (plan gratuito).
2. En el SQL Editor, pega el contenido de [`supabase.sql`](./supabase.sql) y
   pulsa Run. Crea la tabla `kv` y su política de acceso anónimo.

3. Copia `.env.example` a `.env` y rellena la URL y la clave `anon`
   (Project Settings → API).
4. Para el despliegue, define esos dos valores como **repository variables** en
   GitHub (Settings → Secrets and variables → Actions → Variables). El workflow
   ya los pasa al build.

La clave `anon` es pública por diseño: viaja dentro del bundle JS. Quien protege
los datos es la política RLS, no ocultar la clave.

## Publicar en GitHub Pages

`.github/workflows/deploy.yml` compila y publica en cada push a `main`.

1. Crea el repositorio en GitHub y sube el código.
2. En Settings → Pages, pon **Source: GitHub Actions**.
3. Cada push a `main` republica solo.

Queda en `https://<usuario>.github.io/<repo>/`. `vite.config.js` usa
`base: "./"` (rutas relativas), así que funciona en esa subcarpeta sin tener que
escribir el nombre del repo en ningún sitio.
