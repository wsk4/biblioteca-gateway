// L4 · Arma el catalogo con dos fuentes: Google Books los datos, el modelo las sinopsis.
// Se corre con:  node --env-file=.env sembrar.mts
//        o con:  node --env-file=.env sembrar.mts --respaldo
import { mkdirSync, writeFileSync } from 'node:fs';

const CLAVE_GOOGLE = process.env.GOOGLE_BOOKS_API_KEY;
const CLAVE_MODELO = process.env.GROQ_API_KEY;
const MODELO       = process.env.GROQ_MODELO ?? 'openai/gpt-oss-20b';
const CONSULTA     = process.env.CONSULTA ?? 'ciencia ficcion';
const SUB_LECTOR   = process.env.SUB_LECTOR;
const SUB_INVITADO = process.env.SUB_INVITADO;
const RESPALDO     = process.argv.includes('--respaldo');

const CUANTOS_LIBROS = 24;
const MINIMO_LIBROS = 10;
const CUANTOS_PRESTAMOS = 8;
const MIOS = 5;                                                  // prestamos del lector
const SUB_OTRO_SOCIO = '00000000-0000-4000-8000-000000000001';   // un socio que no eres tu

type Libro = {
  id: number; titulo: string; autor: string; anio: number | null; paginas: number | null;
  categoria: string; isbn13: string | null; sinopsis: string; ejemplares: number;
};

// 1 · Lo que no se puede inventar se comprueba antes de gastar una peticion.
if (!RESPALDO && !CLAVE_GOOGLE) { console.error('Falta GOOGLE_BOOKS_API_KEY. Revisa el .env y el tramo 2.3.'); process.exit(1); }
if (!RESPALDO && !CLAVE_MODELO) { console.error('Falta GROQ_API_KEY. Revisa el .env y el tramo 2.4.'); process.exit(1); }

const esSub = (s: string | undefined) =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
if (!esSub(SUB_LECTOR) || !esSub(SUB_INVITADO) || SUB_LECTOR === SUB_INVITADO) {
  console.error('SUB_LECTOR y SUB_INVITADO deben ser dos sub distintos de Cognito, no correos. Revisa 2.5.');
  process.exit(1);
}

// 2 · Google Books: los datos que tienen que ser exactos y comprobables.
type Volumen = {
  volumeInfo?: {
    title?: string; authors?: string[]; publishedDate?: string; pageCount?: number;
    categories?: string[]; industryIdentifiers?: { type?: string; identifier?: string }[];
  };
};

async function pedirLibros(): Promise<Libro[]> {
  if (RESPALDO) {
    const temas = ['La memoria', 'El mapa', 'La biblioteca', 'El viaje', 'La ciudad', 'El jardin'];
    const lugares = ['del sur', 'de la niebla', 'del futuro', 'de las mareas'];
    const autores = ['Elena Rios', 'Tomas Vidal', 'Amira Soto', 'Lucia Campos'];
    return Array.from({ length: CUANTOS_LIBROS }, (_, i) => ({
      id: i + 1,
      titulo: `${temas[i % 6]} ${lugares[Math.floor(i / 6) % 4]}`,
      autor: autores[i % 4],
      anio: 1980 + i,
      paginas: 120 + i * 7,
      categoria: 'novela',
      isbn13: null,                       // el respaldo NO inventa ISBN: no tendria como comprobarlo
      sinopsis: '',
      ejemplares: 1 + (i % 4),
    }));
  }

  const parametros = new URLSearchParams({
    q: CONSULTA, printType: 'books', langRestrict: 'es', orderBy: 'relevance',
    maxResults: String(CUANTOS_LIBROS), key: CLAVE_GOOGLE!,
  });

  let respuesta: Response;
  try {
    respuesta = await fetch(`https://www.googleapis.com/books/v1/volumes?${parametros}`, { signal: AbortSignal.timeout(30000) });
  } catch {
    throw new Error('Google Books no respondio en 30 segundos o fallo la red. Reintenta o usa --respaldo.');
  }
  if (!respuesta.ok) {
    const explicacion: Record<number, string> = {
      400: 'la consulta esta mal armada, o lo que pusiste en la clave no es una API key',
      403: 'la Books API no esta habilitada en tu proyecto de Google Cloud, o la clave esta restringida. Tramo 2.3',
      429: 'cuota agotada. Si el parametro key va vacio, caes en la cuota anonima compartida, que suele estar agotada',
    };
    throw new Error(`Google Books respondio ${respuesta.status}: ${explicacion[respuesta.status] ?? await respuesta.text()}`);
  }

  const { items = [] } = (await respuesta.json()) as { items?: Volumen[] };

  // Una API real devuelve registros incompletos. Se descartan; no se rellenan a mano.
  const usables = items
    .map((it) => it.volumeInfo)
    .filter((v): v is NonNullable<Volumen['volumeInfo']> =>
      !!v && typeof v.title === 'string' && v.title.trim().length > 0
      && Array.isArray(v.authors) && typeof v.authors[0] === 'string');

  console.log(`Google Books: ${items.length} volumenes recibidos, ${usables.length} usables`);
  if (usables.length < MINIMO_LIBROS) {
    throw new Error(`Solo ${usables.length} volumenes usables para "${CONSULTA}"; se necesitan ${MINIMO_LIBROS}. Prueba otra CONSULTA o usa --respaldo.`);
  }

  // 3 · Los id los pone el codigo, contando. No vienen de ninguna de las dos fuentes.
  return usables.map((v, i) => {
    const anio = Number((v.publishedDate ?? '').slice(0, 4));
    return {
      id: i + 1,
      titulo: v.title!.trim(),
      autor: v.authors![0].trim(),
      anio: Number.isInteger(anio) ? anio : null,
      paginas: typeof v.pageCount === 'number' ? v.pageCount : null,
      categoria: (v.categories?.[0] ?? 'sin categoria').toLowerCase(),
      isbn13: v.industryIdentifiers?.find((x) => x.type === 'ISBN_13')?.identifier ?? null,
      sinopsis: '',
      ejemplares: 1 + (i % 4),
    };
  });
}

// 4 · El modelo: lo unico que si puede inventar, la prosa.
function soloElJson(bruto: string): string {
  const t = bruto.trim();
  const abre = t.indexOf('{');
  const cierra = t.lastIndexOf('}');
  if (abre === -1 || cierra === -1) throw new Error(`la respuesta no traia ningun objeto JSON:\n${t.slice(0, 200)}`);
  return t.slice(abre, cierra + 1);
}

async function pedirSinopsis(libros: Libro[]): Promise<Map<number, string>> {
  if (RESPALDO) {
    return new Map(libros.map((l) => [l.id, `Personajes ficticios recorren ${l.categoria} y descubren una historia compartida.`]));
  }

  const listado = libros.map((l) => `${l.id}. ${l.titulo} — ${l.autor}`).join('\n');
  let respuesta: Response;
  try {
    respuesta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CLAVE_MODELO}` },
      body: JSON.stringify({
        model: MODELO,
        max_completion_tokens: 4096,
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Respondes solo con JSON valido, sin texto alrededor.' },
          { role: 'user', content: `Para cada libro de esta lista escribe una sinopsis en espanol de maximo 20 palabras.
Devuelve UNICAMENTE {"sinopsis":[{"id":1,"texto":""}]}, repitiendo el MISMO id que te doy y sin omitir ninguno.

${listado}` },
        ],
      }),
    });
  } catch {
    throw new Error('El modelo no respondio en 30 segundos o fallo la red. Reintenta o usa --respaldo.');
  }

  // 5 · Un 401 o un 429 no hace fallar fetch: revisamos .ok antes de leer la respuesta.
  if (!respuesta.ok) {
    const explicacion: Record<number, string> = {
      401: 'la API key no es valida; revisa la consola del proveedor',
      404: `el modelo "${MODELO}" o el endpoint no esta disponible; revisa el catalogo del proveedor`,
      429: `cuota agotada; Retry-After: ${respuesta.headers.get('retry-after') ?? 'no informado'}. Revisa la cuota diaria o usa --respaldo`,
    };
    throw new Error(`El modelo respondio ${respuesta.status}: ${explicacion[respuesta.status] ?? await respuesta.text()}`);
  }

  const sobre = (await respuesta.json()) as { choices?: { finish_reason?: string; message?: { content?: string } }[] };
  const eleccion = sobre.choices?.[0];
  if (eleccion?.finish_reason === 'length') throw new Error('Respuesta truncada. No se guardaron datos; reintenta o usa --respaldo.');
  const texto = eleccion?.message?.content;
  if (typeof texto !== 'string' || !texto.trim()) throw new Error('El modelo no devolvio contenido de texto. Usa --respaldo.');

  const objeto: unknown = JSON.parse(soloElJson(texto));
  const lista = objeto && typeof objeto === 'object' ? (objeto as { sinopsis?: unknown }).sinopsis : undefined;
  if (!Array.isArray(lista)) throw new Error('El JSON no traia el arreglo "sinopsis". Reintenta o usa --respaldo.');

  const valida = (s: unknown): s is { id: number; texto: string } => {
    if (!s || typeof s !== 'object') return false;
    const x = s as Record<string, unknown>;
    return Number.isInteger(x.id) && typeof x.texto === 'string'
      && x.texto.trim().length > 0 && x.texto.trim().split(/\s+/).length <= 20;
  };
  // Se casan por id, nunca por orden ni por titulo: el modelo puede reordenar u omitir.
  return new Map(lista.filter(valida).map((s) => [s.id, s.texto.trim()]));
}

// 6 · El orquestador. Envuelto para que un fallo se vea como un mensaje, no como un stack trace.
async function principal(): Promise<void> {
  const libros = await pedirLibros();
  const sinopsis = await pedirSinopsis(libros);

  let sinCubrir = 0;
  for (const l of libros) {
    const texto = sinopsis.get(l.id);
    if (texto) l.sinopsis = texto;
    else { l.sinopsis = 'Sin sinopsis disponible.'; sinCubrir++; }
  }
  console.log(`Sinopsis: ${sinopsis.size} validas${sinCubrir ? `, ${sinCubrir} sin cubrir` : ''}`);

  // 6 · Los prestamos los arma el codigo: libroId y usuarioSub son llaves, no adorno.
  const hoy = new Date();
  const dia = (n: number) => new Date(hoy.getTime() + n * 86400000).toISOString().slice(0, 10);
  const prestamos = Array.from({ length: CUANTOS_PRESTAMOS }, (_, i) => ({
    id: i + 1,
    libroId: libros[(i * 3) % libros.length].id,
    // El invitado se queda con CERO a proposito: es el caso que necesitas en los tramos 7 y 11.
    usuarioSub: i < MIOS ? SUB_LECTOR! : SUB_OTRO_SOCIO,
    desde: dia(-14 + i),
    hasta: dia(i),
    devuelto: i % 4 === 0,
  }));

  mkdirSync('datos', { recursive: true });
  const sello = {
    generado: new Date().toISOString(),
    fuente: RESPALDO ? 'respaldo-local-sintetico' : `google-books:${CONSULTA}`,
    sinopsis: RESPALDO ? 'respaldo-local-sintetico' : MODELO,
  };
  writeFileSync('datos/catalogo.json',  JSON.stringify({ ...sello, libros },    null, 2), 'utf8');
  writeFileSync('datos/prestamos.json', JSON.stringify({ ...sello, prestamos }, null, 2), 'utf8');

  console.log(`Listo: ${libros.length} libros y ${prestamos.length} prestamos en datos/`);
  console.log(`  tuyos:        ${prestamos.filter((p) => p.usuarioSub === SUB_LECTOR).length}`);
  console.log(`  de otro socio: ${prestamos.filter((p) => p.usuarioSub === SUB_OTRO_SOCIO).length}`);
  console.log(`  del invitado:  0   <- a proposito: es el caso de los tramos 7 y 11`);
}

await principal().catch((e: unknown) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});