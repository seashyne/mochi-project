// Shared token cursor for the Lua parser. Keeps statement and expression
// parsing in separate modules without duplicating lookahead logic.

import { LuaSyntaxError, type Token } from './luaLexer';

export class TokenStream {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  public peek(offset = 0): Token {
    return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)];
  }

  public next(): Token {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  }

  public check(value: string): boolean {
    const token = this.peek();
    return token.value === value && (token.type === 'symbol' || token.type === 'keyword');
  }

  public match(value: string): boolean {
    if (!this.check(value)) return false;
    this.index += 1;
    return true;
  }

  public expect(value: string): Token {
    if (!this.check(value)) {
      throw new LuaSyntaxError(
        `expected "${value}" but found "${this.peek().value}"`,
        this.peek().line
      );
    }
    return this.next();
  }

  public expectName(): string {
    const token = this.peek();
    if (token.type !== 'name') {
      throw new LuaSyntaxError(`expected a name but found "${token.value}"`, token.line);
    }
    this.index += 1;
    return token.value;
  }

  public atEnd(): boolean {
    return this.peek().type === 'eof';
  }
}
