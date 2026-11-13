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
