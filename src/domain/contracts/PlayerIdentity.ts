declare const playerIdBrand: unique symbol;

/** Canonical cloud player identity. Runtime validation remains at application/DB boundaries. */
export type PlayerId = string & { readonly [playerIdBrand]: true };
