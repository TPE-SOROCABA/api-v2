import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * Query da leitura da semana.
 *
 * `random` continua sendo escrita dentro de um GET — é como o front já usava
 * (`legacyRandomAssign`, fallback do auto-assign) e como a legacy fazia. O que
 * mudou é onde o efeito acontece: `DesignationWriteService.randomize` grava
 * direto, em vez de publicar o agregado na fila FIFO.
 *
 * Qualquer valor não-vazio ativa o sorteio, como na legacy (`if (random)`).
 */
export class WeekDesignationQuery {
  /** Regex crua aplicada no nome do ponto e no nome dos participantes. */
  @IsOptional()
  @IsString({ message: 'filter deve ser texto' })
  filter?: string;

  @IsOptional()
  @IsBoolean({ message: 'random deve ser booleano' })
  @Transform(({ value }) => value === 'true' || value === true || value === '' || value === '1')
  random?: boolean;
}

/** Query do histórico do grupo. As duas datas são obrigatórias — ver `findHistory`. */
export class DesignationHistoryQuery {
  @IsOptional()
  @IsString({ message: 'dateFrom deve ser texto' })
  dateFrom?: string;

  @IsOptional()
  @IsString({ message: 'dateTo deve ser texto' })
  dateTo?: string;
}
