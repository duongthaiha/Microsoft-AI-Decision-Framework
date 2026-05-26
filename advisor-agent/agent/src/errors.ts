/**
 * NotImplementedError — thrown by all M0 stub methods.
 *
 * Every stub that throws this error has a comment explaining what M1
 * will implement in its place.
 */
export class NotImplementedError extends Error {
  constructor(methodName: string) {
    super(`${methodName} is not yet implemented (M0 scaffold — M1 will wire the real logic).`);
    this.name = "NotImplementedError";
    Object.setPrototypeOf(this, NotImplementedError.prototype);
  }
}
