'use client';

// Documents Page — upload financial documents (statements, payslips, bills, receipts)
// and let the Document Agent extract insights + import expenses
import { useState, useRef, useEffect, useCallback } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { useFadeIn } from '@/lib/animations';
import { useAuthStore } from '@/store';
import { getAppUserToken } from '@/services/demo';
import {
    FileText, UploadCloud, Trash2, Loader2, CheckCircle2,
    FileSpreadsheet, Receipt, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface StoredDoc {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    documentType: string;
    summary: string;
    keyFacts: string[];
    insights: string[];
    transactionsImported: number;
    createdAt: { seconds: number } | undefined;
}

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv';

export default function DocumentsPage() {
    const fadeRef = useFadeIn();
    const { user } = useAuthStore();
    const [docs, setDocs] = useState<StoredDoc[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [importExpenses, setImportExpenses] = useState(true);
    const [analysis, setAnalysis] = useState<{
        documentType: string;
        summary: string;
        keyFacts: string[];
        insights: string[];
        transactionsImported: number;
        name: string;
    } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadDocuments = useCallback(async () => {
        if (!user) return;
        try {
            const token = await getAppUserToken(user);
            const res = await fetch('/api/ai/documents', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.data) setDocs(data.data);
            }
        } catch (error) {
            console.error('Failed to load documents:', error);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        loadDocuments();
    }, [loadDocuments]);

    const uploadFile = async (file: File) => {
        if (!user) {
            toast.error('Sign in to upload documents');
            return;
        }

        setIsUploading(true);
        setAnalysis(null);
        const toastId = toast.loading(`Analyzing ${file.name}…`);

        try {
            const token = await getAppUserToken(user);
            const formData = new FormData();
            formData.append('file', file);
            formData.append('importExpenses', String(importExpenses));

            const res = await fetch('/api/ai/documents', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                toast.error(data.error || 'Upload failed', { id: toastId });
                return;
            }

            toast.success(
                data.transactionsImported > 0
                    ? `Analyzed — ${data.transactionsImported} expenses imported`
                    : 'Document analyzed',
                { id: toastId }
            );

            setAnalysis({
                documentType: data.documentType,
                summary: data.summary,
                keyFacts: data.keyFacts || [],
                insights: data.insights || [],
                transactionsImported: data.transactionsImported,
                name: file.name,
            });

            loadDocuments();
        } catch (error) {
            console.error('Upload error:', error);
            toast.error('Upload failed', { id: toastId });
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = async (doc: StoredDoc) => {
        if (!user) return;
        const result = await fetch(`/api/ai/documents?docId=${doc.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${await getAppUserToken(user)}` },
        });
        const data = await result.json();
        if (data.success) {
            toast.success('Document deleted');
            setDocs((prev) => prev.filter((d) => d.id !== doc.id));
        } else {
            toast.error(data.error || 'Delete failed');
        }
    };

    const typeIcon = (type: string) =>
        type.includes('excel') || type === 'csv' ? FileSpreadsheet : FileText;

    const docTypeLabel = (type: string) => type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    return (
        <div ref={fadeRef} className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <FileText className="w-8 h-8 text-primary" />
                        Documents
                    </h1>
                    <p className="text-gray-400 mt-1">Upload statements, payslips, bills & receipts for AI analysis</p>
                </div>
            </div>

            {/* Upload zone */}
            <GlassCard className="p-6">
                <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) uploadFile(file);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                        'border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all',
                        isDragging
                            ? 'border-primary bg-primary/10'
                            : 'border-white/15 hover:border-primary/60 hover:bg-white/5'
                    )}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPT}
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadFile(file);
                        }}
                    />
                    {isUploading ? (
                        <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-3" />
                    ) : (
                        <UploadCloud className="w-10 h-10 text-primary mx-auto mb-3" />
                    )}
                    <h3 className="text-lg font-semibold text-white mb-1">
                        {isUploading ? 'Analyzing your document…' : 'Drop a document here or click to upload'}
                    </h3>
                    <p className="text-gray-400 text-sm mb-4">
                        PDF · PNG/JPG images of statements · Excel/CSV — up to 10MB
                    </p>
                    <label
                        className="inline-flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <input
                            type="checkbox"
                            checked={importExpenses}
                            onChange={(e) => setImportExpenses(e.target.checked)}
                            className="accent-primary"
                        />
                        Auto-import detected expenses
                    </label>
                </div>

            </GlassCard>

            {/* Analysis result */}
            {analysis && (
                <GlassCard className="p-6 border-primary/40">
                    <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-semibold text-white">Analysis of {analysis.name}</h2>
                    </div>
                    <p className="text-gray-300 mb-3">{analysis.summary}</p>
                    {analysis.keyFacts.length > 0 && (
                        <div className="mb-3">
                            <p className="text-sm text-gray-400 mb-1">Key facts</p>
                            <ul className="space-y-1">
                                {analysis.keyFacts.map((fact, i) => (
                                    <li key={i} className="text-sm text-gray-300 flex gap-2">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                                        {fact}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {analysis.insights.length > 0 && (
                        <div>
                            <p className="text-sm text-gray-400 mb-1">Insights</p>
                            <ul className="space-y-1">
                                {analysis.insights.map((insight, i) => (
                                    <li key={i} className="text-sm text-gray-300 flex gap-2">
                                        <Sparkles className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                        {insight}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {analysis.transactionsImported > 0 && (
                        <div className="mt-4 flex items-center gap-2 text-sm text-emerald-400">
                            <Receipt className="w-4 h-4" />
                            Imported {analysis.transactionsImported} expenses from this document
                        </div>
                    )}
                </GlassCard>
            )}

            {/* Document list */}
            <GlassCard className="p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Uploaded Documents</h2>

                {isLoading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    </div>
                ) : docs.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-8">
                        No documents yet. Upload your first bank statement or payslip above.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {docs.map((doc) => {
                            const Icon = typeIcon(doc.mimeType);
                            return (
                                <div key={doc.id} className="flex items-start justify-between gap-4 bg-white/5 rounded-xl px-4 py-3">
                                    <div className="flex gap-3 min-w-0">
                                        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                                            <Icon className="w-4 h-4 text-primary" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-white truncate">{doc.name}</p>
                                            <p className="text-xs text-gray-400">{docTypeLabel(doc.documentType)} · {doc.summary}</p>
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                {doc.transactionsImported > 0 && (
                                                    <span className="text-[11px] bg-emerald-500/15 text-emerald-400 rounded-full px-2 py-0.5">
                                                        {doc.transactionsImported} expenses imported
                                                    </span>
                                                )}
                                                <span className="text-[11px] bg-white/10 text-gray-300 rounded-full px-2 py-0.5">
                                                    {(doc.size / 1024 / 1024).toFixed(2)} MB
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(doc)}
                                        className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
                                        aria-label="Delete document"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </GlassCard>
        </div>
    );
}