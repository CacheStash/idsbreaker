/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Copy, Trash2, Wand2, Check, Info, Sun, Moon, ListOrdered, AlertCircle, Hash, Upload, Download, FileJson, X, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Stats {
  rawLines: number;
  idsCount: number;
  lastId: number | null;
  duplicates: number[];
  skipped: number[];
  possibleTypos: number[];
}

interface SubtitleSequence {
  id: number;
  time: string;
  text: string;
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

  // Subtitle Sync States
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [srtSequences, setSrtSequences] = useState<SubtitleSequence[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persist theme
  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Ekstrak baris teks editor secara real-time untuk analisa statistik dan perbaikan
  const parsedLinesData = useMemo(() => {
    if (!text.trim()) return [];
    return text.split('\n').map(line => {
      const match = line.match(/^\s*(\d+)\s+(.*)$/);
      if (match) {
        return {
          original: line,
          id: parseInt(match[1], 10),
          content: match[2]
        };
      }
      return { original: line, id: null, content: line };
    });
  }, [text]);

  const stats = useMemo((): Stats => {
    if (parsedLinesData.length === 0) return { rawLines: 0, idsCount: 0, lastId: null, duplicates: [], skipped: [], possibleTypos: [] };

    const rawLines = text.split('\n').filter(l => l.trim()).length;
    const ids = parsedLinesData.map(l => l.id).filter((id): id is number => id !== null);
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

    // Deteksi typo menggunakan urutan baris atas-bawah langsung (bukan sekadar rumus IQR statistik global)
    const possibleTypos: number[] = [];
    for (let i = 1; i < parsedLinesData.length - 1; i++) {
      const current = parsedLinesData[i];
      const prev = parsedLinesData[i - 1];
      const next = parsedLinesData[i + 1];

      if (current.id !== null && prev.id !== null && next.id !== null) {
        // Kasus: 690 -> 61 -> 692 (ID saat ini terjun bebas tapi baris berikutnya kembali normal menanjak)
        if (current.id < prev.id && next.id > prev.id) {
          possibleTypos.push(current.id);
        }
        // Kasus: 100 -> 9101 -> 102 (ID saat ini melonjak gila-gilaan tapi baris berikutnya normal kembali)
        else if (current.id > next.id && next.id > prev.id) {
          possibleTypos.push(current.id);
        }
      }
    }

    const skipped: number[] = [];
    const validIds = ids.filter(id => !possibleTypos.includes(id));
    if (validIds.length > 0) {
      const min = Math.min(...validIds);
      const max = Math.max(...validIds);
      for (let i = min; i <= max; i++) {
        if (!seen.has(i)) {
          skipped.push(i);
        }
      }
    }

    return { rawLines, idsCount, lastId, duplicates, skipped, possibleTypos };
  }, [text, parsedLinesData]);

  // Extract IDs and Texts from the current editor content
  const editorData = useMemo(() => {
    const data: Record<number, string> = {};
    parsedLinesData.forEach(line => {
      if (line.id !== null) {
        data[line.id] = line.content.trim();
      }
    });
    return data;
  }, [parsedLinesData]);

  const isSyncMatch = useMemo(() => {
    if (srtSequences.length === 0) return true;
    const editorIds = Object.keys(editorData).map(Number);
    const srtIds = srtSequences.map(s => s.id);
    
    if (editorIds.length !== srtIds.length) return false;
    return srtIds.every(id => editorData[id] !== undefined);
  }, [editorData, srtSequences]);

  const formatText = useCallback((input: string) => {
    const regex = /\{(\d+)\}\s*(.*?)(?=(?:\s*\{\d+\})|$)/gs;
    const matches = [...input.matchAll(regex)];
    
    if (matches.length === 0) return input;

    return matches
      .map(match => `${match[1]} ${match[2].trim()}`)
      .join('\n');
  }, []);

  // Fitur Auto-Fix Typos ID: Memaksa perbaikan urutan baris yang rusak secara instan
  const handleFixTypos = useCallback(() => {
    if (parsedLinesData.length === 0) return;

    // Duplikasi data agar tidak merusak state React secara langsung saat kalkulasi
    const updatedLines = parsedLinesData.map(l => ({ ...l }));
    let hasChanges = false;

    for (let i = 1; i < updatedLines.length - 1; i++) {
      const current = updatedLines[i];
      const prev = updatedLines[i - 1];
      const next = updatedLines[i + 1];

      if (current.id !== null && prev.id !== null && next.id !== null) {
        
        // Pola Kurang Angka (Contoh: 690 -> 61 -> 692)
        if (current.id < prev.id && next.id > prev.id) {
          current.id = prev.id + 1;
          hasChanges = true;
        }
        
        // Pola Kelebihan Angka / Loncat (Contoh: 100 -> 9101 -> 102)
        else if (current.id > next.id && next.id > prev.id) {
          current.id = prev.id + 1;
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      const fixedText = updatedLines
        .map(line => line.id !== null ? `${line.id} ${line.content}` : line.original)
        .join('\n');
      setText(fixedText);
    }
  }, [parsedLinesData]);

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
    setSrtFile(null);
    setSrtSequences([]);
  };

  // Subtitle Parsing Logic
  const parseSRT = (content: string): SubtitleSequence[] => {
    const sequences: SubtitleSequence[] = [];
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const blocks = normalized.split(/\n{2,}/);
    
    blocks.forEach(block => {
      const lines = block.split('\n').map(l => l.trimEnd());
      if (lines.length >= 2) {
        const id = parseInt(lines[0].trim(), 10);
        const time = lines[1].trim();
        
        if (!isNaN(id) && time.includes('-->')) {
          const text = lines.length > 2 ? lines.slice(2).join('\n').trim() : '';
          sequences.push({ id, time, text });
        }
      }
    });
    
    return sequences;
  };

  const handleFileUpload = (file: File) => {
    if (!file.name.endsWith('.srt')) {
      alert('Please upload a .srt file');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const parsed = parseSRT(content);
      setSrtSequences(parsed);
      setSrtFile(file);
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const downloadSRT = () => {
    if (!isSyncMatch || srtSequences.length === 0) return;
    
    const newContent = srtSequences.map(seq => {
      const newText = editorData[seq.id] || seq.text;
      return `${seq.id}\n${seq.time}\n${newText}\n`;
    }).join('\n');
    
    const blob = new Blob([newContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = srtFile?.name || 'synced_subtitle.srt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-[#0a0a0a] text-[#f5f5f5]' : 'bg-[#f5f5f5] text-[#1a1a1a]'} font-sans p-4 md:p-8 flex flex-col items-center`}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`w-full max-w-4xl rounded-3xl shadow-2xl border overflow-hidden flex flex-col h-[85vh] transition-colors duration-300 ${
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
              <h1 className="font-semibold text-lg tracking-tight">Text Splitter & Sub Sync</h1>
              <p className={`text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-white/40' : 'text-black/40'}`}>Offline Utility</p>
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

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Editor Area */}
          <div className={`flex-1 relative p-6 border-r transition-colors duration-300 ${isDarkMode ? 'bg-[#141414] border-white/5' : 'bg-white border-black/5'}`}>
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

          {/* Subtitle Sync Area */}
          <div className={`w-full md:w-80 p-6 flex flex-col gap-4 transition-colors duration-300 ${isDarkMode ? 'bg-black/20' : 'bg-black/[0.02]'}`}>
            <h2 className={`text-xs font-bold uppercase tracking-widest ${isDarkMode ? 'text-white/40' : 'text-black/40'}`}>Subtitle Sync</h2>
            
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex-1 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-all duration-200 ${
                isDragging 
                  ? 'border-emerald-500 bg-emerald-500/5' 
                  : (isDarkMode ? 'border-white/10 hover:border-white/20' : 'border-black/10 hover:border-black/20')
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                className="hidden" 
                accept=".srt"
              />
              
              {srtFile ? (
                <div className="flex flex-col items-center gap-2">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDarkMode ? 'bg-white/5' : 'bg-black/5'}`}>
                    <FileJson className={`w-6 h-6 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
                  </div>
                  <div className="max-w-full">
                    <p className="text-sm font-semibold truncate px-2">{srtFile.name}</p>
                    <p className="text-[10px] uppercase font-bold opacity-40">{srtSequences.length} Sequences</p>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setSrtFile(null); setSrtSequences([]); }}
                    className="mt-2 p-1.5 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className={`w-8 h-8 mb-2 ${isDarkMode ? 'text-white/10' : 'text-black/10'}`} />
                  <p className={`text-sm font-medium ${isDarkMode ? 'text-white/40' : 'text-black/40'}`}>
                    Drag & drop .srt file or click to browse
                  </p>
                </>
              )}
            </div>

            {srtFile && (
              <div className="flex flex-col gap-3">
                {!isSyncMatch && (
                  <div className="flex items-center gap-2 bg-red-500/10 p-3 rounded-xl border border-red-500/20">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    <p className="text-xs font-bold text-red-500">IDS NOT MATCH</p>
                  </div>
                )}
                
                <button
                  onClick={downloadSRT}
                  disabled={!isSyncMatch || srtSequences.length === 0}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold transition-all duration-200 ${
                    !isSyncMatch || srtSequences.length === 0
                      ? (isDarkMode ? 'bg-white/5 text-white/10 cursor-not-allowed' : 'bg-black/5 text-black/20 cursor-not-allowed')
                      : (isDarkMode ? 'bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95' : 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95')
                  }`}
                >
                  <Download className="w-4 h-4" />
                  <span>Sync & Download</span>
                </button>
              </div>
            )}
          </div>
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

              {/* TAMPILAN BARU: Info Kemungkinan Typo ID + Tombol Auto-Fix */}
              {stats.possibleTypos.length > 0 && (
                <div className="flex items-center gap-2 bg-red-500/10 pl-2 pr-1 py-0.5 rounded-md border border-red-500/20">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[10px] font-bold text-red-500 uppercase">Kemungkinan Typo ID:</span>
                    <span className="text-xs font-mono font-bold text-red-500">{stats.possibleTypos.join(', ')}</span>
                  </div>
                  <button
                    onClick={handleFixTypos}
                    className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
                    title="Perbaiki otomatis id yang typo berdasarkan baris sebelum dan sesudah"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    Fix Otomatis
                  </button>
                </div>
              )}

              {stats.skipped.length > 0 && (
                <div className="flex items-center gap-1.5 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-[10px] font-bold text-amber-500 uppercase">Skipped:</span>
                  <span className="text-xs font-mono font-bold text-amber-500">
                    {stats.skipped.length > 15 
                      ? `${stats.skipped.slice(0, 15).join(', ')}... (+${stats.skipped.length - 15} lagi)` 
                      : stats.skipped.join(', ')}
                  </span>
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
        className="mt-8 max-w-4xl w-full px-6"
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
