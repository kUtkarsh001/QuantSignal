/**
 * StockContext.jsx — Global stock + agent results state
 * Architecture §2.2
 *
 * Provides: activeStock, agentResults, setActiveStock, setAgentResults
 *
 * activeStock: { symbol, companyName, sector, candles, indicators, ... }
 * agentResults: { agentA, agentB, agentC, agentBAvailable, latencyMs, analysisId }
 *
 * Both are preserved across navigation — StockContext wraps the full app
 * so Dashboard results don't reset when user visits KnowledgeBase and returns.
 * Architecture §2.2: "agentResults elevated to StockContext (global)"
 */

import { createContext, useContext, useState, useCallback } from 'react';

const StockContext = createContext(null);

export function StockProvider({ children }) {
  const [activeStock,   setActiveStockRaw]   = useState(null);
  const [agentResults,  setAgentResultsRaw]  = useState(null);
  const [isAnalyzing,   setIsAnalyzing]      = useState(false);
  const [isFetching,    setIsFetching]        = useState(false);

  const setActiveStock  = useCallback((data) => setActiveStockRaw(data),  []);
  const setAgentResults = useCallback((data) => setAgentResultsRaw(data), []);

  const value = {
    activeStock,
    agentResults,
    isAnalyzing,
    isFetching,
    setActiveStock,
    setAgentResults,
    setIsAnalyzing,
    setIsFetching,
  };

  return (
    <StockContext.Provider value={value}>
      {children}
    </StockContext.Provider>
  );
}

export function useStock() {
  const ctx = useContext(StockContext);
  if (!ctx) throw new Error('useStock must be used inside <StockProvider>');
  return ctx;
}
