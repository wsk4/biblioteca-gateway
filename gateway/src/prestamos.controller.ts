import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  Headers,
  UnauthorizedException,
  Body,
} from '@nestjs/common';
import { verificar, tieneScope } from './auth/verificador';

// Fuera de Compose el microservicio esta en localhost; dentro, el compose.yml pasa PRESTAMOS_URL.
const PRESTAMOS_URL = process.env.PRESTAMOS_URL ?? 'http://localhost:3002';


@Controller('v1/prestamos')
export class PrestamosController {
  @Get()
  async listar(
    @Headers('authorization') authorization?: string,
  ): Promise<unknown> {
    let claims;
    try {
      claims = await verificar(authorization);
    } catch (e) {
      throw new UnauthorizedException((e as Error).message);
    }


    if (!tieneScope(claims, 'biblioteca/prestamos.leer')) {
      throw new ForbiddenException('te falta el permiso biblioteca/prestamos.leer');
    }


    const respuesta = await fetch(`${PRESTAMOS_URL}/prestamos`);
    return respuesta.json();
  }


  @Post()
  async crear(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
): Promise<unknown> {
    let claims;
    try {
      claims = await verificar(authorization);
    } catch (e) {
      throw new UnauthorizedException((e as Error).message);
    }


    if (!tieneScope(claims, 'biblioteca/prestamos.escribir')) {
      throw new ForbiddenException('te falta el permiso biblioteca/prestamos.escribir');
    }


    const respuesta = await fetch(`${PRESTAMOS_URL}/prestamos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return respuesta.json();
  }
}