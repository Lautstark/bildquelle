import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArasaacProvider } from '../src/arasaac.js';

interface Pictogram {
  _id: number;
  keywords: { keyword: string }[];
  aac?: boolean;
  aacColor?: boolean;
  schematic?: boolean;
  violence?: boolean;
}

const jsonResponse = (body: Pictogram[]) =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as unknown as Response;

const notFound = () => ({ ok: false, status: 404 }) as unknown as Response;

/** Each test uses its own search term: the IndexedDB cache is shared and real. */
describe('ArasaacProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks ARASAAC for the language it was told to search', async () => {
    const fetchSpy = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(jsonResponse([])));
    vi.stubGlobal('fetch', fetchSpy);

    await new ArasaacProvider('en').search('language-endpoint');
    expect(String(fetchSpy.mock.calls[0]![0])).toContain('/pictograms/en/search/');

    await new ArasaacProvider().search('language-endpoint-default');
    // Unstated stays German: bildhaft says nothing and must keep what it had.
    expect(String(fetchSpy.mock.calls[1]![0])).toContain('/pictograms/de/search/');
  });

  it('does not let a German answer stand in for an English one', async () => {
    /*
     * The failure this exists for is quiet. ARASAAC's German endpoint does not
     * reject an English word - `/de/search/water` answers 200 with a
     * water-transport sign - so a cache keyed on the bare word would have
     * served that picture to an English reader for the full thirty days,
     * looking exactly like a correct answer.
     */
    const german = vi.fn(() => Promise.resolve(jsonResponse([
      { _id: 2273, keywords: [{ keyword: 'Wasserstraße' }] },
    ])));
    vi.stubGlobal('fetch', german);
    const de = await new ArasaacProvider('de').search('sharedspelling');
    expect(de.map((c) => c.id)).toEqual(['2273']);

    const english = vi.fn(() => Promise.resolve(jsonResponse([
      { _id: 2248, keywords: [{ keyword: 'water' }] },
    ])));
    vi.stubGlobal('fetch', english);
    const en = await new ArasaacProvider('en').search('sharedspelling');

    // It went and asked, rather than answering out of the German row.
    expect(english).toHaveBeenCalledOnce();
    expect(en.map((c) => c.id)).toEqual(['2248']);
  });

  it('keeps both languages, so switching back costs no request', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(jsonResponse([
      { _id: 77, keywords: [{ keyword: 'both' }] },
    ])));
    vi.stubGlobal('fetch', fetchSpy);

    const provider = new ArasaacProvider('de');
    await provider.search('keptbylanguage');
    provider.setLanguage('en');
    await provider.search('keptbylanguage');
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    provider.setLanguage('de');
    await provider.search('keptbylanguage');
    // The German row was never evicted by the English one.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('is usable immediately, with no setup', () => {
    const arasaac = new ArasaacProvider();
    expect(arasaac.isReady()).toBe(true);
    expect(arasaac.status()).toEqual({ kind: 'ready' });
  });

  it('puts symbols drawn for communication boards first', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse([
      { _id: 1, keywords: [{ keyword: 'Apfel' }], aacColor: true },
      { _id: 2, keywords: [{ keyword: 'Apfel' }], schematic: true },
      { _id: 3, keywords: [{ keyword: 'Apfel essen wollen' }] },
      { _id: 4, keywords: [{ keyword: 'Apfel' }], violence: true },
    ]))));

    const hits = await new ArasaacProvider().search('Apfel');
    expect(hits.map((c) => c.id)).toEqual(['1', '2', '4', '3']);
    // The whole-phrase pictogram sinks: its artwork usually has words drawn into
    // it, which reads badly beside a caption of our own.
    expect(hits.at(-1)?.label).toBe('Apfel essen wollen');
  });

  it('treats ARASAAC’s 404 as “no results”, not as a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(notFound())));

    const arasaac = new ArasaacProvider();
    expect(await arasaac.search('gibtesnicht')).toEqual([]);
    expect(arasaac.status()).toEqual({ kind: 'ready' });
  });

  it('answers a repeated lookup from cache, without a second request', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(jsonResponse([
      { _id: 10, keywords: [{ keyword: 'Brot' }] },
    ])));
    vi.stubGlobal('fetch', fetchSpy);

    await new ArasaacProvider().search('Brot');
    const again = await new ArasaacProvider().search('Brot');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(again.map((c) => c.label)).toEqual(['Brot']);
  });

  it('serves a stale cache rather than nothing when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse([
      { _id: 20, keywords: [{ keyword: 'Milch' }] },
    ]))));
    await new ArasaacProvider().search('Milch');

    // Past the 30-day freshness window, with no way to refresh.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 1000 * 60 * 60 * 24 * 31);
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));

    const hits = await new ArasaacProvider().search('Milch');
    expect(hits.map((c) => c.label)).toEqual(['Milch']);
  });

  it('reports a network failure it cannot paper over', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));

    const arasaac = new ArasaacProvider();
    expect(await arasaac.search('Straßenbahn')).toEqual([]);
    expect(arasaac.status()).toEqual({ kind: 'error', code: 'network', message: 'offline' });
  });

  it('coalesces concurrent lookups of the same word', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(jsonResponse([
      { _id: 30, keywords: [{ keyword: 'Wasser' }] },
    ])));
    vi.stubGlobal('fetch', fetchSpy);

    const arasaac = new ArasaacProvider();
    await Promise.all([arasaac.search('Wasser'), arasaac.search('WASSER '), arasaac.search('wasser')]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('caches an image so a second session works offline', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(
      { ok: true, status: 200, blob: () => Promise.resolve(new Blob(['png'])) } as unknown as Response,
    ));
    vi.stubGlobal('fetch', fetchSpy);

    expect(await new ArasaacProvider().getImageUrl('4711')).toMatch(/^blob:/);
    expect(await new ArasaacProvider().getImageUrl('4711')).toMatch(/^blob:/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to the remote URL when an image request fails', async () => {
    // Rate limiting and 5xx are usually transient. Returning null here would
    // leave the host rendering a spinner that never resolves; the remote URL at
    // least lets <img> try and report a real error.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 503 } as unknown as Response)));
    expect(await new ArasaacProvider().getImageUrl('8123'))
      .toBe('https://static.arasaac.org/pictograms/8123/8123_500.png');

    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    expect(await new ArasaacProvider().getImageUrl('8124'))
      .toBe('https://static.arasaac.org/pictograms/8124/8124_500.png');
  });

  it('asks the API host, not the static one, for the greyscale rendering', async () => {
    // The whole of why the method exists: `?color=false` on the static URL is
    // ignored, because that host serves pre-rendered files. Only the API host
    // renders on demand.
    const fetchSpy = vi.fn(() => Promise.resolve(
      { ok: true, status: 200, blob: () => Promise.resolve(new Blob(['sw'])) } as unknown as Response,
    ));
    vi.stubGlobal('fetch', fetchSpy);

    expect(await new ArasaacProvider().getMonochromeImageUrl('6964')).toMatch(/^blob:/);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.arasaac.org/api/pictograms/6964?download=false&color=false&resolution=500');
  });

  it('keeps the two renderings of one id apart in the cache', async () => {
    // One row for both would hand back whichever was asked for first, and the
    // coloured pictogram put through a two-tone mapping comes out tinted.
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      seen.push(url);
      return Promise.resolve(
        { ok: true, status: 200, blob: () => Promise.resolve(new Blob([url])) } as unknown as Response);
    }));

    await new ArasaacProvider().getImageUrl('2317');
    await new ArasaacProvider().getMonochromeImageUrl('2317');
    // A third and a fourth ask are answered from the cache, one row each.
    await new ArasaacProvider().getImageUrl('2317');
    await new ArasaacProvider().getMonochromeImageUrl('2317');

    expect(seen).toEqual([
      'https://static.arasaac.org/pictograms/2317/2317_500.png',
      'https://api.arasaac.org/api/pictograms/2317?download=false&color=false&resolution=500',
    ]);
  });

  it('falls back to the API URL when the greyscale request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 503 } as unknown as Response)));
    expect(await new ArasaacProvider().getMonochromeImageUrl('8125'))
      .toBe('https://api.arasaac.org/api/pictograms/8125?download=false&color=false&resolution=500');
  });

  it('recovers a label for a symbol restored from storage', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse([
      { _id: 40, keywords: [{ keyword: 'Katze' }] },
    ]))));
    await new ArasaacProvider().search('Katze');

    // A fresh instance, as after a reload: the id came back from the host's own
    // storage and needs a caption again.
    expect(await new ArasaacProvider().labelFor('40')).toBe('Katze');
  });
});
