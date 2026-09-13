import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';

const ARCHIVO = new URL('../datos/prestamos.json', import.meta.url);
const leer = () => JSON.parse(readFileSync(ARCHIVO, 'utf8'));
const guardar = (d) => writeFileSync(ARCHIVO, JSON.stringify(d, null, 2), 'utf8');

const LATENCIA_SIMULADA_MS = 300;

const json = (res, codigo, cuerpo) => {
  res.writeHead(codigo, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(cuerpo));
};

const leerCuerpo = async (peticion) => {
  const trozos = [];
  for await (const t of peticion) trozos.push(t);
  return JSON.parse(Buffer.concat(trozos).toString() || '{}');
};

createServer(async (peticion, respuesta) => {
  await new Promise((listo) => setTimeout(listo, LATENCIA_SIMULADA_MS));
  const datos = leer();
  const { method: metodo, url } = peticion;
  console.log(`[prestamos] ${metodo} ${url}`);

  if (metodo === 'GET') return json(respuesta, 200, datos.prestamos);

  if (metodo === 'POST') {
    const nuevo = await leerCuerpo(peticion);
    nuevo.id = Math.max(0, ...datos.prestamos.map((p) => p.id)) + 1;   // el id lo pone el dueno del dato
    datos.prestamos.push(nuevo);
    guardar(datos);
    return json(respuesta, 201, nuevo);
  }

  if (metodo === 'DELETE') {
    const id = Number(url.split('/').pop());
    const prestamo = datos.prestamos.find((p) => p.id === id);
    if (!prestamo) return json(respuesta, 404, { mensaje: `no existe el prestamo ${id}` });
    prestamo.devuelto = true;                     // devolver no es borrar
    guardar(datos);
    return json(respuesta, 200, prestamo);
  }

  json(respuesta, 405, { mensaje: `metodo ${metodo} no soportado` });
}).listen(3002, () => console.log('microservicio de prestamos escuchando en http://localhost:3002'));