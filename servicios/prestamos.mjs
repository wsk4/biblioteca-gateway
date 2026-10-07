import { createServer } from 'node:http';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ROUTING_KEYS } from './mensajeria/topologia.mjs';
import { conectarPublicador, publicar } from './mensajeria/publicador.mjs';
import { prepararEsquema, listar, crear, devolver } from './repositorio-prestamos.mjs';


const LATENCIA_SIMULADA_MS = 300;
const RABBITMQ_URL = process.env.RABBITMQ_URL;
const EMISOR = process.env.COGNITO_ISSUER;


if (!RABBITMQ_URL || !EMISOR) {
  throw new Error(
    'faltan RABBITMQ_URL o COGNITO_ISSUER: arranca con --env-file=servicios/.env',
  );
}


await prepararEsquema();
console.log('[prestamos] esquema prestamos listo');


const jwks = createRemoteJWKSet(
  new URL(`${EMISOR}/.well-known/jwks.json`),
);


const json = (res, codigo, cuerpo) => {
  res.writeHead(codigo, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(cuerpo));
};


const leerCuerpo = async (peticion) => {
  const trozos = [];


  for await (const trozo of peticion) {
    trozos.push(trozo);
  }


  return JSON.parse(Buffer.concat(trozos).toString() || '{}');
};


const subDelToken = async (cabecera) => {
  if (!cabecera?.startsWith('Bearer ')) {
    return null;
  }


  try {
    const { payload } = await jwtVerify(cabecera.slice(7), jwks, {
      issuer: EMISOR,
    });


    return payload.sub ?? null;
  } catch {
    return null;
  }
};


await conectarPublicador(RABBITMQ_URL);
console.log(`[prestamos] publicando en ${new URL(RABBITMQ_URL).host}`);


createServer(async (peticion, respuesta) => {
  await new Promise((listo) => setTimeout(listo, LATENCIA_SIMULADA_MS));


  const { method: metodo, url } = peticion;


  console.log(`[prestamos] ${metodo} ${url}`);


  if (metodo === 'GET') {
    try {
      return json(respuesta, 200, await listar());
    } catch (error) {
      console.error(`[prestamos] no se pudo listar: ${error.message || error.code}`);
      return json(respuesta, 503, { mensaje: 'la base de datos no responde' });
    }
  }


  if (metodo === 'POST') {
    const sub = await subDelToken(peticion.headers['authorization']);
    if (!sub) return json(respuesta, 401, { mensaje: 'falta un token valido' });


    const cuerpo = await leerCuerpo(peticion);
    let nuevo;
    try {
      nuevo = await crear({ libroId: cuerpo.libroId, usuarioSub: sub, desde: cuerpo.desde, hasta: cuerpo.hasta });
    } catch (error) {
      if (error.code === '23505') return json(respuesta, 409, { mensaje: 'ya tienes un prestamo vigente de ese libro' });
      if (/^2[23]/.test(error.code ?? '')) return json(respuesta, 400, { mensaje: error.message });
      console.error(`[prestamos] no se pudo guardar: ${error.message || error.code}`);
      return json(respuesta, 503, { mensaje: 'la base de datos no responde' });
    }


    publicar(ROUTING_KEYS.prestamoCreado, {
      prestamoId: nuevo.id,
      libroId: nuevo.libroId,
      usuarioSub: sub,
      hasta: nuevo.hasta,
    });


    return json(respuesta, 201, nuevo);
  }


  if (metodo === 'DELETE') {
    const sub = await subDelToken(peticion.headers['authorization']);
    if (!sub) return json(respuesta, 401, { mensaje: 'falta un token valido' });


    const id = Number(url.split('/').pop());
    let prestamo;
    try {
      prestamo = Number.isInteger(id) ? await devolver(id) : null;
    } catch (error) {
      console.error(`[prestamos] no se pudo devolver: ${error.message || error.code}`);
      return json(respuesta, 503, { mensaje: 'la base de datos no responde' });
    }
    if (!prestamo) return json(respuesta, 404, { mensaje: `no existe el prestamo ${id}` });


    publicar(ROUTING_KEYS.prestamoDevuelto, {
      prestamoId: prestamo.id,
      libroId: prestamo.libroId,
      usuarioSub: sub,
    });


    return json(respuesta, 200, prestamo);
  }


  return json(respuesta, 405, {
    mensaje: `metodo ${metodo} no soportado`,
  });
}).listen(3002, () => {
  console.log('microservicio de prestamos escuchando en http://localhost:3002');
});