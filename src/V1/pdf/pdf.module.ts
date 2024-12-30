import { Module } from '@nestjs/common';
import { PDFService } from './pdf.service';
import { PDFController } from './pdf.controller';

@Module({
  providers: [PDFService],
  controllers: [PDFController]
})
export class PDFModule {}
