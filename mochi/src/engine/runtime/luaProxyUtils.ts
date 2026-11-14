// Small helpers shared by the Lua proxies.

export function defineAlias(
  target: Record<string, unknown>,
  names: string[],
  get: () => unknown,
  set: (value: unknown) => void
): void {
  for (const name of names) {
    Object.defineProperty(target, name, { get, set, enumerable: true, configurable: true });
  }
}

/** The last function in an argument list, so both `:Connect(fn)` and `.Connect(fn)` work. */
export function lastFunction(args: unknown[]): ((...params: unknown[]) => void) | undefined {
  for (let index = args.length - 1; index >= 0; index -= 1) {
    if (typeof args[index] === 'function') return args[index] as (...params: unknown[]) => void;
  }
  return undefined;
}
