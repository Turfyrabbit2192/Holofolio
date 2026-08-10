import React, { createContext, useContext, useMemo, useState, useCallback } from "react";
import type { ScanAnalyzeResult } from "@/api/scan";

interface ScanSessionValue {
  frontUri: string | null;
  backUri: string | null;
  result: ScanAnalyzeResult | null;
  /** Set when rescanning an existing collection item, so the results screen updates it instead of creating a new one. */
  collectionItemId: string | null;
  setFrontUri: (uri: string | null) => void;
  setBackUri: (uri: string | null) => void;
  setResult: (result: ScanAnalyzeResult | null) => void;
  setCollectionItemId: (id: string | null) => void;
  reset: () => void;
}

const ScanSessionContext = createContext<ScanSessionValue | null>(null);

export function ScanSessionProvider({ children }: { children: React.ReactNode }) {
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const [result, setResult] = useState<ScanAnalyzeResult | null>(null);
  const [collectionItemId, setCollectionItemId] = useState<string | null>(null);

  const reset = useCallback(() => {
    setFrontUri(null);
    setBackUri(null);
    setResult(null);
    setCollectionItemId(null);
  }, []);

  const value = useMemo(
    () => ({ frontUri, backUri, result, collectionItemId, setFrontUri, setBackUri, setResult, setCollectionItemId, reset }),
    [frontUri, backUri, result, collectionItemId, reset]
  );

  return <ScanSessionContext.Provider value={value}>{children}</ScanSessionContext.Provider>;
}

export function useScanSession(): ScanSessionValue {
  const ctx = useContext(ScanSessionContext);
  if (!ctx) throw new Error("useScanSession must be used within ScanSessionProvider");
  return ctx;
}
