/** A JSON number retains whether Python's decoder creates an int or a float. */
export class JsonNumber {
  readonly integer: boolean;
  constructor(readonly source: string) {
    this.integer = !/[.eE]/.test(source);
    if (!this.integer && !Number.isFinite(Number(source))) {
      throw new Error("non-finite JSON numbers are unsupported");
    }
  }
  toString(): string { return this.source; }
  canonical(): string {
    if (this.integer) return BigInt(this.source).toString();
    return pythonFloat(Number(this.source));
  }
}

function pythonFloat(value: number): string {
  if (Object.is(value, -0)) return "-0.0";
  const [mantissa, exponentText] = value.toExponential().split("e") as [string, string];
  const exponent = Number(exponentText);
  if (exponent < -4 || exponent >= 16) {
    return `${mantissa}e${exponent < 0 ? "-" : "+"}${String(Math.abs(exponent)).padStart(2, "0")}`;
  }
  const text = String(value);
  return Number.isInteger(value) ? `${text}.0` : text;
}

/** Strict JSON grammar, retaining numeric tokens; duplicate members use the last value. */
export function parseLosslessJson(text: string): unknown {
  if (text.length > 1_048_576) throw new Error("bundle JSON is too large");
  return new JsonReader(text).parse();
}

class JsonReader {
  private offset = 0;
  constructor(private readonly text: string) {}
  parse(): unknown {
    const value = this.value(0);
    this.whitespace();
    if (this.offset !== this.text.length) this.fail();
    return value;
  }
  private fail(): never { throw new Error(`invalid bundle JSON at character ${this.offset}`); }
  private whitespace(): void {
    while (/[\t\n\r ]/.test(this.text[this.offset] ?? "!")) this.offset++;
  }
  private consume(token: string): boolean {
    this.whitespace();
    if (!this.text.startsWith(token, this.offset)) return false;
    this.offset += token.length;
    return true;
  }
  private string(): string {
    this.whitespace();
    const match = /^"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/.exec(this.text.slice(this.offset));
    if (!match) this.fail();
    this.offset += match[0].length;
    return JSON.parse(match[0]) as string;
  }
  private value(depth: number): unknown {
    if (depth > 128) throw new Error("bundle JSON is too deeply nested");
    this.whitespace();
    const character = this.text[this.offset];
    if (character === '"') return this.string();
    if (this.consume("{")) return this.object(depth + 1);
    if (this.consume("[")) return this.array(depth + 1);
    for (const [token, value] of [["null", null], ["true", true], ["false", false]] as const) {
      if (this.consume(token)) return value;
    }
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(this.text.slice(this.offset));
    if (!match) this.fail();
    this.offset += match[0].length;
    return new JsonNumber(match[0]);
  }
  private array(depth: number): unknown[] {
    const items: unknown[] = [];
    if (this.consume("]")) return items;
    do { items.push(this.value(depth)); } while (this.consume(","));
    if (!this.consume("]")) this.fail();
    return items;
  }
  private object(depth: number): Record<string, unknown> {
    const items: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    if (this.consume("}")) return items;
    do {
      const key = this.string();
      if (!this.consume(":")) this.fail();
      items[key] = this.value(depth);
    } while (this.consume(","));
    if (!this.consume("}")) this.fail();
    return items;
  }
}
