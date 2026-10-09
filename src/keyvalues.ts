/**
 * Valve KeyValues parser for the shipped TF2 items_game.txt.
 *
 * Handles quoted strings with escapes, // line comments outside quotes and
 * nested objects; rejects truncated documents instead of guessing.
 */

/** Parse Valve KeyValues text used by the shipped TF2 items_game.txt. */
export function parseSchemaDocument(raw: string): unknown {
  let source = "";
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < raw.length; index++) {
    const character = raw[index];
    const next = raw[index + 1];
    if (character === '"' && !escaped) quoted = !quoted;
    if (!quoted && character === "/" && next === "/") {
      while (index < raw.length && raw[index] !== "\n") index++;
      source += "\n";
      continue;
    }
    source += character;
    escaped = character === "\\" && !escaped;
    if (character !== "\\") escaped = false;
  }

  const tokens = [
    ...source.matchAll(/"((?:\\.|[^"\\])*)"|\{|\}|([^\s{}"]+)/g),
  ].map((match) =>
    match[1] !== undefined ? match[1].replace(/\\([\\"])/g, "$1") : match[0],
  );
  let position = 0;

  const parseObject = (): Record<string, unknown> => {
    const object: Record<string, unknown> = {};
    while (position < tokens.length && tokens[position] !== "}") {
      const key = tokens[position++];
      if (!key || position >= tokens.length)
        throw new Error("TF2_SCHEMA_KEYVALUES_INVALID");
      if (tokens[position] === "{") {
        position++;
        object[key] = parseObject();
        if (tokens[position] !== "}")
          throw new Error("TF2_SCHEMA_KEYVALUES_INVALID");
        position++;
      } else {
        object[key] = tokens[position++];
      }
    }
    return object;
  };

  const root = parseObject();
  if (position !== tokens.length)
    throw new Error("TF2_SCHEMA_KEYVALUES_INVALID");
  return root;
}

export function parseSchemaInput(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return parseSchemaDocument(raw);
  }
}
