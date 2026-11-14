export async function readPublicStoreData<T>(apiPath: string, snapshotPath: string): Promise<T> {
  const options = { cache: 'no-store', signal: AbortSignal.timeout(8000) } as const;
  let response = await fetch(apiPath, options);
  // Static hosting can serve the app shell for an API route.
  if (response.status === 404 || response.headers.get('content-type')?.includes('text/html')) {
    response = await fetch(snapshotPath, options);
  }
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Could not load store data.');
  }
  return response.json() as Promise<T>;
}
