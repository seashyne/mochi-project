// Pure helpers behind the Lua standard library: printf-style formatting and a
// deterministic PRNG. Kept free of interpreter types so they stay unit-testable.

export function formatLuaString(
  format: string,
  args: unknown[],
  stringify: (value: unknown) => string
): string {
  let index = 0;
  const pattern = /%([-+ 0#]*)(\d*)(?:\.(\d+))?([diouxXeEfgGqsc%])/g;

  return format.replace(pattern, (_match, flags: string, width: string, precision: string, spec: string) => {
    if (spec === '%') return '%';
    const value = args[index++];
    let text: string;

    switch (spec) {
      case 'd':
      case 'i': {
        const num = Math.trunc(toNumber(value));
        text = String(num);
        if (flags.includes('+') && num >= 0) text = `+${text}`;
        else if (flags.includes(' ') && num >= 0) text = ` ${text}`;
        break;
      }
      case 'u':
        text = String(Math.max(0, Math.trunc(toNumber(value))));
        break;
      case 'o':
        text = Math.trunc(toNumber(value)).toString(8);
        break;
      case 'x':
        text = Math.trunc(toNumber(value)).toString(16);
        break;
      case 'X':
        text = Math.trunc(toNumber(value)).toString(16).toUpperCase();
        break;
      case 'c':
        text = String.fromCharCode(Math.trunc(toNumber(value)));
        break;
      case 'f':
      case 'F':
        text = toNumber(value).toFixed(precision === '' ? 6 : Number(precision));
        break;
      case 'e':
      case 'E':
        text = toNumber(value).toExponential(precision === '' ? 6 : Number(precision));
        if (spec === 'E') text = text.toUpperCase();
        break;
      case 'g':
      case 'G':
        text = String(Number(toNumber(value).toPrecision(precision === '' ? 6 : Number(precision))));
        break;
      case 'q':
        text = JSON.stringify(stringify(value));
        break;
      default:
        text = stringify(value);
        break;
    }

    const padWidth = width === '' ? 0 : Number(width);
    if (text.length >= padWidth) return text;
    const padChar = flags.includes('0') && !flags.includes('-') ? '0' : ' ';
    const padding = padChar.repeat(padWidth - text.length);
    return flags.includes('-') ? text + padding : padding + text;
  });
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Small deterministic LCG so scripts can seed reproducible randomness. */
export class LuaRandom {
  private state: number;

  constructor(seed?: number) {
    this.state = seed === undefined ? (Date.now() >>> 0) : (Math.trunc(seed) >>> 0) || 1;
  }

  public reseed(seed: number): void {
    this.state = (Math.trunc(seed) >>> 0) || 1;
  }

  public next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }
}
