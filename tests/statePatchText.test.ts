import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/state-patch-node.json";
import { computeStatePatchBundleHash, parseStatePatchBundle } from "../src/shared/statePatchHash";

describe("original bundle JSON", () => {
  it.each(fixtures)("matches node loader for $source", ({source, hash}) => {
    expect(computeStatePatchBundleHash(parseStatePatchBundle(source))).toBe(hash);
  });
  const bundle = {version: 1, patch_id: "valid-patch", activation_height: 12, changes: [{key: "con_x.value", value: 1}]};
  it.each([0, -1, 1.2, null])("rejects invalid activation height %s", height => {
    expect(() => parseStatePatchBundle(JSON.stringify({...bundle, activation_height: height}))).toThrow();
  });
  it("rejects duplicate change keys", () => {
    expect(() => parseStatePatchBundle({...bundle, changes: [...bundle.changes, ...bundle.changes]})).toThrow(/duplicate/);
  });
  it.each(["", "bad id", "Xxx"])("rejects invalid patch id %s", patch_id => {
    expect(() => parseStatePatchBundle({...bundle, patch_id})).toThrow();
  });
  it.each(["con_x.__code__", "con_x.__xian_ir_v1__"])("rejects direct artifact patch %s", key => {
    expect(() => parseStatePatchBundle({...bundle, changes: [{key, value: "x"}]})).toThrow();
  });
  it("keeps JSON duplicate member last-value semantics like the node", () => {
    const source = JSON.stringify(bundle).replace('"value":1', '"value":0,"value":1');
    expect(computeStatePatchBundleHash(parseStatePatchBundle(source))).toBe(computeStatePatchBundleHash(parseStatePatchBundle(bundle)));
  });
});

it.each(['{"x":01}', '{"x":1,}', '[1,]', '{"x":NaN}', '{"x":1e999}', '{"x":"\\q"}', 'null garbage'])("rejects malformed or non-finite input %s", source => {
  expect(() => parseStatePatchBundle(source)).toThrow();
});
it("does not treat a JSON __proto__ member as an inherited setting", () => {
  const source = '{"version":1,"patch_id":"valid-patch","activation_height":12,"changes":[{"key":"con_x.value","value":{"__proto__":{"polluted":true}}}]}';
  expect(computeStatePatchBundleHash(parseStatePatchBundle(source))).toHaveLength(64);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});
it("rejects deeply nested input before recursion exhausts the browser stack", () => {
  expect(() => parseStatePatchBundle('['.repeat(130)+'0'+']'.repeat(130))).toThrow(/deeply/);
});
