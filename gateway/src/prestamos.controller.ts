import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';

import {
  verificar,
  tieneScope,
  estaEnGrupo,
} from './auth/verificador';

@Controller('v1/prestamos')
export class PrestamosController {
  @Get()
  async listar(
    @Headers('authorization') authorization?: string,
  ): Promise<unknown> {
    let claims;

    // Autenticación del token
    try {
      claims = await verificar(authorization);
    } catch (e) {
      throw new UnauthorizedException(
        (e as Error).message,
      );
    }

    // Debe tener exactamente este scope
    if (!tieneScope(claims, 'biblioteca/libros.leer')) {
      throw new ForbiddenException(
        'te falta el permiso biblioteca/libros.leer',
      );
    }

    // Debe pertenecer al grupo bibliotecarios
    if (!estaEnGrupo(claims, 'bibliotecarios')) {
      throw new ForbiddenException(
        'debes pertenecer al grupo bibliotecarios',
      );
    }

    const respuesta = await fetch(
      'http://localhost:3002/prestamos',
    );

    if (!respuesta.ok) {
      throw new Error(
        `Error en el servicio de préstamos: ${respuesta.status}`,
      );
    }

    return respuesta.json();
  }
}