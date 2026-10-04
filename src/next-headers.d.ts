// The slice of `next/headers` this package uses. `next` is a peer dependency
// resolved in the app; declaring it here keeps it out of devDependencies.
declare module "next/headers" {
  interface ReadonlyHeadersLike {
    get(name: string): string | null;
  }
  export function headers(): Promise<ReadonlyHeadersLike> | ReadonlyHeadersLike;
}
