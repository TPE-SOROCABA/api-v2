/**
 * Dias da semana — port 1:1 de `api/src/enums/Weekday.ts` (legacy).
 *
 * `WeekdayNumber` da legacy é um enum com reverse mapping (`WeekdayNumber['MONDAY'] === 1`),
 * ou seja o número é exatamente o índice de `Date.getDay()` (0 = domingo).
 */
export const WEEKDAY_NUM: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

export const WEEKDAY_PT_BR: Record<string, string> = {
  SUNDAY: 'Domingo',
  MONDAY: 'Segunda-feira',
  TUESDAY: 'Terça-feira',
  WEDNESDAY: 'Quarta-feira',
  THURSDAY: 'Quinta-feira',
  FRIDAY: 'Sexta-feira',
  SATURDAY: 'Sábado',
  OTHER: 'Outro',
};
