/**
 * Accumulate paginated employee rows until a short page or empty first page.
 */
export async function collectHomebaseEmployeesPages<T>(
  uuid: string,
  apiKey: string,
  perPage: number,
  fetchPage: (uuid: string, page: number, apiKey: string) => Promise<T[]>,
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;

  for (;;) {
    const data = await fetchPage(uuid, page, apiKey);

    if (data.length === 0 && page === 1) {
      return all;
    }

    all.push(...data);

    if (data.length < perPage) {
      break;
    }

    page += 1;
  }

  return all;
}
