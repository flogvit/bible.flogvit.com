import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { UkvnMapper, ukvnEncode, ukvnDecode, resolveMappingId } from '@free-bible/kvn/browser';
import type { UkvnMappingFile } from '@free-bible/kvn/browser';

interface MappingContextValue {
  /** All loaded mapping files, keyed by mapping ID */
  mappingFiles: Record<string, UkvnMappingFile>;
  /** Get a UkvnMapper for a mapping ID. Returns null if not loaded. */
  getMapper: (mappingId: string) => UkvnMapper | null;
  /** Convert osmain coordinates to a target mapping */
  osmainTo: (bookId: number, chapter: number, verse: number, mappingId: string) => { chapter: number; verse: number };
  /** Convert from a source mapping's coordinates to osmain */
  toOsmain: (bookId: number, chapter: number, verse: number, mappingId: string) => { chapter: number; verse: number };
  /** Convert from one mapping to another */
  convert: (bookId: number, chapter: number, verse: number, fromMapping: string, toMapping: string) => { chapter: number; verse: number };
  /** Whether mappings are loaded */
  loaded: boolean;
}

const MappingContext = createContext<MappingContextValue>({
  mappingFiles: {},
  getMapper: () => null,
  osmainTo: (_b, chapter, verse) => ({ chapter, verse }),
  toOsmain: (_b, chapter, verse) => ({ chapter, verse }),
  convert: (_b, chapter, verse) => ({ chapter, verse }),
  loaded: false,
});

export function MappingProvider({ children }: { children: ReactNode }) {
  const [mappingFiles, setMappingFiles] = useState<Record<string, UkvnMappingFile>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/mappings/kvn/all')
      .then(res => res.json())
      .then(data => {
        setMappingFiles(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const mappers = useMemo(() => {
    const cache = new Map<string, UkvnMapper>();
    return {
      get(mappingId: string): UkvnMapper | null {
        const resolved = resolveMappingId(mappingId);
        if (!resolved) return null;
        let mapper = cache.get(resolved);
        if (!mapper) {
          const file = mappingFiles[resolved];
          if (!file) return null;
          mapper = new UkvnMapper(file);
          cache.set(resolved, mapper);
        }
        return mapper;
      },
    };
  }, [mappingFiles]);

  const value = useMemo<MappingContextValue>(() => ({
    mappingFiles,
    loaded,
    getMapper: (id: string) => mappers.get(id),

    osmainTo(bookId, chapter, verse, mappingId) {
      const mapper = mappers.get(mappingId);
      if (!mapper) return { chapter, verse };
      const osmainKvn = ukvnEncode(bookId, chapter, verse);
      const tkvn = mapper.toTkvn(osmainKvn);
      const d = ukvnDecode(tkvn);
      return { chapter: d.chapter, verse: d.verse };
    },

    toOsmain(bookId, chapter, verse, mappingId) {
      const mapper = mappers.get(mappingId);
      if (!mapper) return { chapter, verse };
      const tkvn = ukvnEncode(bookId, chapter, verse);
      const osmainKvn = mapper.toKvn(tkvn);
      const d = ukvnDecode(osmainKvn);
      return { chapter: d.chapter, verse: d.verse };
    },

    convert(bookId, chapter, verse, fromMapping, toMapping) {
      const fromMapper = mappers.get(fromMapping);
      const toMapper = mappers.get(toMapping);
      if (!fromMapper || !toMapper) return { chapter, verse };
      // from → osmain → to
      const tkvn = ukvnEncode(bookId, chapter, verse);
      const osmainKvn = fromMapper.toKvn(tkvn);
      const targetTkvn = toMapper.toTkvn(osmainKvn);
      const d = ukvnDecode(targetTkvn);
      return { chapter: d.chapter, verse: d.verse };
    },
  }), [mappingFiles, loaded, mappers]);

  return (
    <MappingContext.Provider value={value}>
      {children}
    </MappingContext.Provider>
  );
}

export function useMapping() {
  return useContext(MappingContext);
}
