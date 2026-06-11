export function reportLovableError(
  error: Error,
  context: { boundary: string }
): void {
  console.error(`[${context.boundary}]`, error);
  // In production, send to error tracking service
}