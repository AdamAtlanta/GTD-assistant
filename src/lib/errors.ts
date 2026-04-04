export function getErrorMessage(
  error: unknown,
  fallback = "An unexpected error occurred.",
): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
