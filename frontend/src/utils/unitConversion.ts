export type UnitSystem = 'mm' | 'inches' | 'points';

const PT_TO_MM = 0.3528;
const INCH_TO_MM = 25.4;

export function toMM(value: number, from: UnitSystem): number {
  switch (from) {
    case 'mm': return value;
    case 'inches': return value * INCH_TO_MM;
    case 'points': return value * PT_TO_MM;
  }
}

export function fromMM(value: number, to: UnitSystem): number {
  switch (to) {
    case 'mm': return value;
    case 'inches': return value / INCH_TO_MM;
    case 'points': return value / PT_TO_MM;
  }
}

export function formatValue(value: number, unit: UnitSystem): string {
  const converted = fromMM(value, unit);
  switch (unit) {
    case 'mm': return `${converted.toFixed(1)} mm`;
    case 'inches': return `${converted.toFixed(3)}"`;
    case 'points': return `${converted.toFixed(1)} pt`;
  }
}

export function unitLabel(unit: UnitSystem): string {
  switch (unit) {
    case 'mm': return 'mm';
    case 'inches': return 'in';
    case 'points': return 'pt';
  }
}
