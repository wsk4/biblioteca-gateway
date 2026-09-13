import { Module } from '@nestjs/common';
import { LibrosController } from './libros.controller';
import { PrestamosController } from './prestamos.controller';
import { PanelController } from './panel.controller';        // <- 1 · el import

@Module({
  controllers: [LibrosController, PrestamosController, PanelController],   // <- 2 · y aca
})
export class AppModule {}