/** A successful result containing a value. */
export type Ok<T> = { ok: true; value: T; };

/** A failed result containing a recoverable error. */
export type Err<E = Error> = { ok: false; error: E; };

/**
 * Represents the outcome of an operation that can fail in an expected,
 * recoverable way.
 *
 * Use `Result` instead of throwing exceptions when the caller is expected to
 * handle the failure, such as validation errors, missing resources, or failed
 * external requests.
 *
 * @template T The type returned when the operation succeeds.
 * @template E The type returned when the operation fails.
 *
 * @example
 * const result = getPreferredTheme(user);
 * const theme = result.ok ? result.value : DEFAULT_THEME; // No saved theme is fine: fall back to the default.
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * Creates a successful result.
 *
 * @see Result
 */
export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

/**
 * Creates a failed result.
 *
 * @see Result
 */
export const err = <E = Error>(error: E): Err<E> => ({ ok: false, error });
