/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Copy, Trash2, Wand2, Check, Info, Sun, Moon, ListOrdered, AlertCircle, Hash } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Stats {
  rawLines: number;
  idsCount: number;
  lastId: number | null;
  duplicates: number[];
  skipped: number[];
}

export default function App() {
  const [text, setText] = useState('');
  const [isAutoFormat, setIsAutoFormat] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Persist theme
  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const stats = useMemo((): Stats => {
    if (!text.trim()) return { rawLines: 0, idsCount: 0, lastId: null, duplicates: [], skipped: [] };

    const rawLines = text.split('\n').filter(l => l.trim()).length;
    
    // Match {n} anywhere OR n at the start of a line
    const regex = /(?:\{(\d+)\})|(?:^\s*(\d+)(?=\s+))/gm;
    const matches = [...text.matchAll(regex)];
    const ids = matches.map(m => parseInt(m[1] || m[2], 10));
    const idsCount = ids.length;
    const lastId = ids.length > 0 ? Math.max(...ids) : null;

    const duplicates: number[] = [];
    const seen = new Set<number>();
    ids.forEach(id => {
      if (seen.has(id)) {
        if (!duplicates.includes(id)) duplicates.push(id);
      }
      seen.add(id);
    });

    const skipped: number[] = [];
    if (ids.length > 0) {
      const min = Math.min(...ids);
      const max = Math.max(...ids);
      for (let i = min; i <= max; i++) {
        if (!seen.has(i)) {
          skipped.push(i);
        }
      }
    }

    return { rawLines, idsCount, lastId, duplicates, skipped };
  }, [text]);

  const formatText = useCallback((input: string) => {
    const regex = /\{(\d+)\}\s*(.*?)(?=(?:\s*\{\d+\})|$)/gs;
    const matches = [...input.matchAll(regex)];
    
    if (matches.length === 0) return input;

    return matches
      .map(match => `${match[1]} ${match[2].trim()}`)
      .join('\n');
  }, []);

  // Handle toggle logic
  useEffect(() => {
    if (isAutoFormat && text.trim()) {
      const formatted = formatText(text);
      if (formatted !== text) {
        setText(formatted);
      }
    }
  }, [isAutoFormat, text, formatText]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleClear = () => {
    setText('');
    setIsAutoFormat(false);
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-[#0a0a0a] text-[#f5f5f5]' : 'bg-[#f5f5f5] text-[#1a1a1a]'} font-sans p-4 md:p-8 flex flex-col items-center`}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`w-full max-w-3xl rounded-3xl shadow-2xl border overflow-hidden flex flex-col h-[85vh] transition-colors duration-300 ${
          isDarkMode ? 'bg-[#141414] border-white/5' : 'bg-white border-black/5'
        }`}
      >
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between sticky top-0 z-10 transition-colors duration-300 ${
          isDarkMode ? 'bg-[#141414] border-white/5' : 'bg-white border-black/5'
        }`}>
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isDarkMode ? 'bg-white text-black' : 'bg-black text-white'}`}>
              <Wand2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold text-lg tracking-tight">Text Splitter</h1>
              <p className={`text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-white/40' : 'text-black/40'}`}>Offline Formatter</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`p-2 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-white/5 text-yellow-400' : 'hover:bg-black/5 text-indigo-600'}`}
              title="Toggle Theme"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            <div className="h-6 w-[1px] bg-current opacity-10" />

            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${isDarkMode ? 'text-white/60' : 'text-black/60'}`}>Auto Format</span>
              <button
                onClick={() => setIsAutoFormat(!isAutoFormat)}
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
                  isAutoFormat ? 'bg-emerald-500' : (isDarkMode ? 'bg-white/10' : 'bg-black/10')
                }`}
              >
                <motion.div
                  animate={{ x: isAutoFormat ? 26 : 2 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className="absolute top-1 left-0 w-4 h-4 rounded-full shadow-sm bg-white"
                />
              </button>
            </div>
          </div>
        </div>

        {/* Editor Area */}
        <div className={`flex-1 relative p-6 transition-colors duration-300 ${isDarkMode ? 'bg-[#141414]' : 'bg-white'}`}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your text here... e.g. {1} Hello {2} World"
            className={`w-full h-full resize-none border-none focus:ring-0 text-lg leading-relaxed font-medium transition-colors duration-300 ${
              isDarkMode ? 'bg-transparent text-white placeholder:text-white/10' : 'bg-transparent text-black placeholder:text-black/20'
            }`}
            spellCheck={false}
          />
          
          <AnimatePresence>
            {text.length === 0 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-12 text-center"
              >
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isDarkMode ? 'bg-white/5' : 'bg-black/5'}`}>
                  <Info className={`w-8 h-8 ${isDarkMode ? 'text-white/10' : 'text-black/20'}`} />
                </div>
                <p className={`text-sm max-w-xs ${isDarkMode ? 'text-white/30' : 'text-black/40'}`}>
                  Paste text with format <code className={`px-1 rounded ${isDarkMode ? 'bg-white/10' : 'bg-black/5'}`}>{"{number} [text]"}</code> and toggle the switch to split it.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Stats Bar */}
        <AnimatePresence>
          {text.length > 0 && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className={`px-6 py-3 border-t flex flex-wrap gap-4 items-center transition-colors duration-300 ${
                isDarkMode ? 'bg-white/[0.01] border-white/5' : 'bg-black/[0.01] border-black/5'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Hash className={`w-3.5 h-3.5 ${isDarkMode ? 'text-white/20' : 'text-black/20'}`} />
                <span className={`text-xs font-bold ${isDarkMode ? 'text-white/40' : 'text-black/40'}`}>RAW LINES:</span>
                <span className="text-xs font-mono font-bold">{stats.rawLines}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ListOrdered className={`w-3.5 h-3.5 ${isDarkMode ? 'text-white/20' : 'text-black/20'}`} />
                <span className={`text-xs font-bold ${isDarkMode ? 'text-white/40' : 'text-black/40'}`}>TOTAL IDS:</span>
                <span className="text-xs font-mono font-bold">{stats.idsCount}</span>
              </div>
              
              {stats.lastId !== null && (
                <div className="flex items-center gap-1.5">
                  <Wand2 className={`w-3.5 h-3.5 ${isDarkMode ? 'text-white/20' : 'text-black/20'}`} />
                  <span className={`text-xs font-bold ${isDarkMode ? 'text-white/40' : 'text-black/40'}`}>LAST ID:</span>
                  <span className="text-xs font-mono font-bold">{stats.lastId}</span>
                </div>
              )}
              
              {stats.duplicates.length > 0 && (
                <div className="flex items-center gap-1.5 bg-red-500/10 px-2 py-0.5 rounded-md border border-red-500/20">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-[10px] font-bold text-red-500 uppercase">Duplicate:</span>
                  <span className="text-xs font-mono font-bold text-red-500">{stats.duplicates.join(', ')}</span>
                </div>
              )}

              {stats.skipped.length > 0 && (
                <div className="flex items-center gap-1.5 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-[10px] font-bold text-amber-500 uppercase">Skipped:</span>
                  <span className="text-xs font-mono font-bold text-amber-500">{stats.skipped.join(', ')}</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer Actions */}
        <div className={`px-6 py-4 border-t flex items-center justify-between transition-colors duration-300 ${
          isDarkMode ? 'bg-white/[0.02] border-white/5' : 'bg-black/[0.02] border-black/5'
        }`}>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClear}
              className={`p-2 rounded-xl transition-colors ${
                isDarkMode ? 'hover:bg-white/5 text-white/20 hover:text-red-400' : 'hover:bg-black/5 text-black/40 hover:text-red-500'
              }`}
              title="Clear text"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCopy}
              disabled={text.length === 0}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl font-semibold transition-all duration-200 ${
                text.length === 0 
                  ? (isDarkMode ? 'bg-white/5 text-white/10 cursor-not-allowed' : 'bg-black/5 text-black/20 cursor-not-allowed')
                  : (isDarkMode ? 'bg-white text-black hover:bg-white/90 active:scale-95' : 'bg-black text-white hover:bg-black/80 active:scale-95')
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Result</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Example Section */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8 max-w-3xl w-full px-6"
      >
        <h2 className={`text-xs font-bold uppercase tracking-widest mb-4 ${isDarkMode ? 'text-white/20' : 'text-black/30'}`}>How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className={`p-4 rounded-2xl border transition-colors duration-300 ${isDarkMode ? 'bg-white/[0.02] border-white/5' : 'bg-white/50 border-black/5'}`}>
            <p className={`text-[10px] font-bold uppercase mb-2 ${isDarkMode ? 'text-white/10' : 'text-black/20'}`}>Input Format</p>
            <p className={`text-sm font-mono leading-relaxed ${isDarkMode ? 'text-white/40' : 'text-black/60'}`}>
              {"{1} Sedikit lagi, di ujung jalan itu belok kanan... {2} Di Osaka peraturannya bener-er ketat ya."}
            </p>
          </div>
          <div className={`p-4 rounded-2xl border transition-colors duration-300 ${isDarkMode ? 'bg-white/[0.02] border-white/5' : 'bg-white/50 border-black/5'}`}>
            <p className={`text-[10px] font-bold uppercase mb-2 ${isDarkMode ? 'text-white/10' : 'text-black/20'}`}>Output Result</p>
            <p className={`text-sm font-mono leading-relaxed whitespace-pre-line ${isDarkMode ? 'text-white/40' : 'text-black/60'}`}>
              {"1 Sedikit lagi, di ujung jalan itu belok kanan...\n2 Di Osaka peraturannya bener-er ketat ya."}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
