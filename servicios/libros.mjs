import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

// Se lee en cada peticion a proposito: asi editar el JSON no obliga a reiniciar el servicio.
const leer = () =>
  JSON.parse(readFileSync(new URL('../datos/catalogo.json', import.meta.url), 'utf8')).libros;

// Latencia simulada. En produccion este servicio estaria en otra maquina y la red costaria algo.
const LATENCIA_SIMULADA_MS = 300;

createServer(async (peticion, respuesta) => {
  await new Promise((listo) => setTimeout(listo, LATENCIA_SIMULADA_MS));
  const libros = leer();
  console.log(`[libros] ${peticion.method} ${peticion.url} -> ${libros.length}`);
  respuesta.writeHead(200, { 'Content-Type': 'application/json' });
  respuesta.end(JSON.stringify(libros));
}).listen(3001, () => console.log('microservicio de libros escuchando en http://localhost:3001'));