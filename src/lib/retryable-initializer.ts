export function createRetryableInitializer(
  initialize: () => Promise<void>,
): () => Promise<void> {
  let initialization: Promise<void> | null = null;

  return () => {
    if (!initialization) {
      initialization = initialize().catch((error: unknown) => {
        initialization = null;
        throw error;
      });
    }

    return initialization;
  };
}
