import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { verificar, tieneScope } from './auth/verificador';

@Controller('v1/libros')
export class LibrosController {
  @Get()
  async listar(
    @Headers('authorization') authorization?: string,
  ): Promise<unknown> {
    // ── autenticación: ¿este token es de fiar? ──
    let claims;
    try {
      claims = await verificar(authorization);
    } catch (e) {
      throw new UnauthorizedException((e as Error).message);   // → 401
    }

    // ── autorización: ¿y le alcanza para esto? ──
    if (!tieneScope(claims, 'biblioteca/libros.leer')) {
      throw new ForbiddenException('te falta el permiso biblioteca/libros.leer');  // → 403
    }

    const respuesta = await fetch('http://localhost:3001/libros');
    return respuesta.json();
  }

  @Post()
  async crear(
    @Headers('authorization') authorization?: string,
  ): Promise<unknown> {
    let claims;
    try {
      claims = await verificar(authorization);
    } catch (e) {
      throw new UnauthorizedException((e as Error).message);
    }

    if (!tieneScope(claims, 'biblioteca/libros.escribir')) {
      throw new ForbiddenException('te falta el permiso biblioteca/libros.escribir');
    }

    return { ok: true };
  }
}