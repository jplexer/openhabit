import parseBMF from "commodetto/parseBMF";
import Resource from "Resource";

export function font(name) {
  const cache = globalThis.__fonts ?? (globalThis.__fonts = {});
  return cache[name] ?? (cache[name] = parseBMF(new Resource(name + ".bf4")));
}
