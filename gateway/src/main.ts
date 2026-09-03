import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';


/**
 * El gateway, en HTTP sobre el 8080.
 *
 * ── Por qué HTTP y no el HTTPS con que terminó L1 ──
 *
 * El paso 2.5 de L1 dejaba esto escuchando en `https://localhost:8443` con un
 * certificado autofirmado, para poder ver en Wireshark la diferencia entre un
 * token que viaja legible y uno que no. Esa parte está en
 * `docs/https-y-wireshark.md`, con el `main.ts` completo para pegar y rehacer
 * la captura cuando quieras.
 *
 * Acá vuelve al 8080 en HTTP porque es lo que piden los laboratorios que siguen:
 * L2 llama a `http://localhost:8080/v1/libros` en el tramo 2 y en las cuatro
 * pruebas del tramo 9. Con el 8443 puesto, el primer `curl` de L2 falla y no es
 * evidente por qué.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // El frontend Angular de más adelante vive en el 4200, que es **otro origen**
  // —mismo host, distinto puerto ya basta—.
  //
  // Ojo con lo que esto no es: CORS no protege tu API. El servidor responde lo
  // mismo a cualquier origen; quien se niega a entregarle el resultado al
  // JavaScript es el navegador. Un `curl` se lo salta sin esfuerzo.
  app.enableCors({ origin: 'http://localhost:4200' });

  await app.listen(8080);
  console.log('gateway escuchando en http://localhost:8080');
}
void bootstrap();
