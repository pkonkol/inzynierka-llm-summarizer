import { useEffect, useState } from "react";

import {
    createSummaryJob,
    getAuthStatus,
    getJobsForUrl,
    getJobStatus,
    getToken,
    listSummarizedUrls,
} from "../api/client";
import { CompletedJobsList } from "../components/CompletedJobsList";
import { SummaryDetailPanel } from "../components/SummaryDetailPanel";
import { LoginOverlay } from "../components/LoginOverlay";
import { UrlSubmitCard } from "../components/UrlSubmitCard";
import type { JobStatus, SummaryUrlListItem } from "../types/api";

const LIST_REFRESH_MS = 20_000;
const POLLING_MS = 2_500;

type PendingSubmit = {
    url: string;
    model_provider: string;
    model_name: string;
    language: string;
    summary_mode: string;
    run_deepeval: boolean;
} | null;

export function HomePage() {
    const [isAuthEnabled, setIsAuthEnabled] = useState(false);
    const [isLoginOpen, setIsLoginOpen] = useState(false);
    const [pendingSubmit, setPendingSubmit] = useState<PendingSubmit>(null);

    const [urlList, setUrlList] = useState<SummaryUrlListItem[]>([]);
    const [isLoadingList, setIsLoadingList] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
    const [detailJobs, setDetailJobs] = useState<JobStatus[]>([]);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);

    const [activeJobId, setActiveJobId] = useState<string | null>(null);
    const [flashMessage, setFlashMessage] = useState<string | null>(null);

    const hasDetailOpen = Boolean(selectedUrl);

    const loadUrlList = async () => {
        const data = await listSummarizedUrls(50);
        setUrlList(data);
    };

    const loadDetailForUrl = async (url: string) => {
        setIsLoadingDetail(true);
        try {
            setDetailJobs(await getJobsForUrl(url, "completed"));
        } finally {
            setIsLoadingDetail(false);
        }
    };

    const submitSummary = async (
        url: string,
        model_provider: string,
        model_name: string,
        language: string,
        summary_mode: string,
        run_deepeval: boolean,
    ) => {
        setIsSubmitting(true);
        setFlashMessage("Zadanie zostało utworzone. Trwa analiza artykułu...");
        try {
            const created = await createSummaryJob(
                url,
                model_provider,
                model_name,
                language,
                summary_mode,
                run_deepeval,
            );
            setActiveJobId(created.job_id);
        } catch (error) {
            setFlashMessage(`Nie udało się utworzyć joba: ${String(error)}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async (
        url: string,
        model_provider: string,
        model_name: string,
        language: string,
        summary_mode: string,
        run_deepeval: boolean,
    ) => {
        if (!isAuthEnabled || getToken()) {
            await submitSummary(url, model_provider, model_name, language, summary_mode, run_deepeval);
            return;
        }
        setPendingSubmit({ url, model_provider, model_name, language, summary_mode, run_deepeval });
        setIsLoginOpen(true);
    };

    const handleLoginSuccess = async () => {
        setIsLoginOpen(false);
        if (!pendingSubmit) return;
        const { url, model_provider, model_name, language, summary_mode, run_deepeval } = pendingSubmit;
        setPendingSubmit(null);
        await submitSummary(url, model_provider, model_name, language, summary_mode, run_deepeval);
    };

    useEffect(() => {
        let isMounted = true;
        const initialize = async () => {
            try {
                const [authResult, listResult] = await Promise.allSettled([
                    getAuthStatus(),
                    listSummarizedUrls(50),
                ]);
                if (!isMounted) return;
                if (authResult.status === "fulfilled") setIsAuthEnabled(authResult.value.enabled);
                if (listResult.status === "fulfilled") setUrlList(listResult.value);
            } finally {
                if (isMounted) setIsLoadingList(false);
            }
        };
        void initialize();
        const interval = setInterval(() => { void loadUrlList(); }, LIST_REFRESH_MS);
        return () => { isMounted = false; clearInterval(interval); };
    }, []);

    useEffect(() => {
        if (!selectedUrl) { setDetailJobs([]); return; }
        void loadDetailForUrl(selectedUrl);
    }, [selectedUrl]);

    useEffect(() => {
        if (!activeJobId) return;
        const poll = async () => {
            try {
                const status = await getJobStatus(activeJobId);
                if (status.status === "completed") {
                    setFlashMessage("Podsumowanie gotowe.");
                    setActiveJobId(null);
                    await loadUrlList();
                    setSelectedUrl(status.source_url);
                } else if (status.status === "failed") {
                    setFlashMessage(`Job zakończył się błędem: ${status.error ?? "nieznany błąd"}`);
                    setActiveJobId(null);
                }
            } catch (error) {
                setFlashMessage(`Błąd podczas odczytu statusu: ${String(error)}`);
                setActiveJobId(null);
            }
        };
        const interval = setInterval(() => { void poll(); }, POLLING_MS);
        void poll();
        return () => clearInterval(interval);
    }, [activeJobId]);

    useEffect(() => {
        if (!flashMessage) return;
        const t = setTimeout(() => setFlashMessage(null), 4500);
        return () => clearTimeout(t);
    }, [flashMessage]);

    console.log(detailJobs);
    return (
        <>
        <LoginOverlay
            isOpen={isLoginOpen}
            onClose={() => { setIsLoginOpen(false); setPendingSubmit(null); }}
            onSuccess={() => { void handleLoginSuccess(); }}
        />

        <main className={
            hasDetailOpen
                ? "mx-auto grid w-full max-w-355 gap-4 px-3.5 py-7 lg:grid-cols-[minmax(460px,38%)_minmax(740px,62%)] lg:items-start"
                : "mx-auto grid w-full max-w-355 gap-4 px-3.5 py-7"
        }>
            <section className={
                hasDetailOpen
                    ? "min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-32px)] lg:overflow-y-auto lg:overflow-x-hidden lg:pr-1.5"
                    : "min-w-0"
            }>
                {!hasDetailOpen ? (
                    <UrlSubmitCard onSubmit={handleSubmit} isSubmitting={isSubmitting} />
                ) : null}

                {flashMessage ? (
                    <div className="mt-3.5 border border-success-border bg-success-bg px-3.5 py-2.5 text-[0.94rem] text-success-text">
                        {flashMessage}
                    </div>
                ) : null}

                <CompletedJobsList
                    urls={urlList}
                    selectedUrl={selectedUrl}
                    isLoading={isLoadingList}
                    isFocused={hasDetailOpen}
                    onSelectUrl={setSelectedUrl}
                />
            </section>

            <SummaryDetailPanel
                isOpen={hasDetailOpen}
                sourceUrl={selectedUrl}
                jobs={detailJobs}
                isLoading={isLoadingDetail}
                onClose={() => setSelectedUrl(null)}
            />
        </main>
        </>
    );
}
