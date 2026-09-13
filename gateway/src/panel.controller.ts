import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpException,
  Param,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { verificar, tieneScope } from './auth/verificador';

const BFF_URL = process.env.BFF_URL!;

@Controller('v1/panel')
export class PanelController {
  private async haciaElBff(
    ruta: string,
    authorization?: string,
  ): Promise<unknown> {
    let claims;

    try {
      claims = await verificar(authorization);
    } catch (error) {
      throw new UnauthorizedException((error as Error).message);
    }

    if (!tieneScope(claims, 'biblioteca/libros.leer')) {
      throw new ForbiddenException(
        'te falta el permiso biblioteca/libros.leer',
      );
    }

    let respuesta: Response;

    try {
      respuesta = await fetch(`${BFF_URL}${ruta}`, {
        headers: {
          authorization: authorization!,
        },
      });
    } catch {
      throw new ServiceUnavailableException('el BFF no responde');
    }

    const cuerpo: unknown = await respuesta.json();

    if (!respuesta.ok) {
      throw new HttpException(
        cuerpo as Record<string, unknown>,
        respuesta.status,
      );
    }

    return cuerpo;
  }

  private async enviarAlBff(
    metodo: 'POST' | 'DELETE',
    ruta: string,
    authorization?: string,
    cuerpo?: unknown,
  ): Promise<unknown> {
    let claims;

    try {
      claims = await verificar(authorization);
    } catch (error) {
      throw new UnauthorizedException((error as Error).message);
    }

    if (!tieneScope(claims, 'biblioteca/libros.leer')) {
      throw new ForbiddenException(
        'te falta el permiso biblioteca/libros.leer',
      );
    }

    let respuesta: Response;

    try {
      respuesta = await fetch(`${BFF_URL}${ruta}`, {
        method: metodo,
        headers: {
          authorization: authorization!,
          ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
        },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
    } catch {
      throw new ServiceUnavailableException('el BFF no responde');
    }

    const respuestaCuerpo: unknown = await respuesta.json();

    if (!respuesta.ok) {
      throw new HttpException(
        respuestaCuerpo as Record<string, unknown>,
        respuesta.status,
      );
    }

    return respuestaCuerpo;
  }

  @Get()
  async panel(@Headers('authorization') authorization?: string) {
    return this.haciaElBff('/panel', authorization);
  }

  @Get('todos')
  async todos(@Headers('authorization') authorization?: string) {
    return this.haciaElBff('/panel/todos', authorization);
  }

  @Post('prestamos')
  async prestar(
    @Body() cuerpo: unknown,
    @Headers('authorization') authorization?: string,
  ) {
    return this.enviarAlBff(
      'POST',
      '/panel/prestamos',
      authorization,
      cuerpo,
    );
  }

  @Delete('prestamos/:id')
  async devolver(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.enviarAlBff(
      'DELETE',
      `/panel/prestamos/${id}`,
      authorization,
    );
  }
}