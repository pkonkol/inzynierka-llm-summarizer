import { useEffect, useState } from "react";

import {
    createSummaryJob,
    getAuthStatus,
    getJobsForUrl,
    getJobStatus,
    listSummarizedUrls,
} from "./api/client";
import { CompletedJobsList } from "./components/CompletedJobsList";
import { JobDetailPanel } from "./components/JobDetailPanel";
import { LoginOverlay } from "./components/LoginOverlay";
import { NavDock } from "./components/NavDock";
import { UrlSubmitCard } from "./components/UrlSubmitCard";
import type { JobStatus, SummaryUrlListItem } from "./types/api";

const LIST_REFRESH_MS = 20_000;
const POLLING_MS = 2_500;

type Route = "home" | "jobs" | "research";

type PendingSubmit = {
    url: string;
    model_provider: string;
    model_name: string;
    language: string;
} | null;

function ResearchPlaceholder() {
    return (
        <div className="mx-auto w-full max-w-355 px-3.5 py-12">
            <p className="font-mono text-[0.9rem] text-muted">
                [Research] — placeholder. Tu trafi wyszukiwanie semantyczne i query expansion.
            </p>
        </div>
    );
}

function JobsPage() {
    return (
        <div className="mx-auto w-full max-w-355 px-3.5 py-7">
            <p className="font-mono text-[0.9rem] text-muted">
                /jobs — legacy widok pojedynczych jobów (do zachowania dla debugowania).
            </p>
        </div>
    );
}

function App() {
    const [route, setRoute] = useState<Route>("home");

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

    // ── data fetchers ──────────────────────────────────────────────────────────

    const loadUrlList = async () => {
        const data = await listSummarizedUrls(50);
        setUrlList(data);
    };

    const loadDetailForUrl = async (url: string) => {
        setIsLoadingDetail(true);
        try {
            const jobs = await getJobsForUrl(url);
            setDetailJobs(jobs);
        } finally {
            setIsLoadingDetail(false);
        }
    };

    const submitSummary = async (
        url: string,
        model_provider: string,
        model_name: string,
        language: string,
    ) => {
        setIsSubmitting(true);
        setFlashMessage("Zadanie zostało utworzone. Trwa analiza artykułu...");
        try {
            const created = await createSummaryJob(url, model_provider, model_name, language);
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
    ) => {
        if (!isAuthEnabled || getToken()) {
            await submitSummary(url, model_provider, model_name, language);
            return;
        }
        setPendingSubmit({ url, model_provider, model_name, language });
        setIsLoginOpen(true);
    };

    const handleLoginSuccess = async () => {
        setIsLoginOpen(false);
        if (!pendingSubmit) return;
        const { url, model_provider, model_name, language } = pendingSubmit;
        setPendingSubmit(null);
        await submitSummary(url, model_provider, model_name, language);
    };

    // ── effects ────────────────────────────────────────────────────────────────

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

    // ── render ─────────────────────────────────────────────────────────────────

    return (
        <div className="relative min-h-screen overflow-x-hidden">
            <LoginOverlay
                isOpen={isLoginOpen}
                onClose={() => { setIsLoginOpen(false); setPendingSubmit(null); }}
                onSuccess={() => { void handleLoginSuccess(); }}
            />

            <NavDock active={route} onNavigate={setRoute} />

            {route === "research" && <ResearchPlaceholder />}
            {route === "jobs" && <JobsPage />}

            {route === "home" && (
                <main
                    className={
                        hasDetailOpen
                            ? "mx-auto grid w-full max-w-355 gap-4 px-3.5 py-7 lg:grid-cols-[minmax(420px,40%)_minmax(680px,60%)] lg:items-start"
                            : "mx-auto grid w-full max-w-355 gap-4 px-3.5 py-7"
                    }
                >
                    <section
                        className={
                            hasDetailOpen
                                ? "min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-32px)] lg:overflow-y-auto lg:overflow-x-hidden lg:pr-1.5"
                                : "min-w-0"
                        }
                    >
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

                    <JobDetailPanel
                        isOpen={hasDetailOpen}
                        sourceUrl={selectedUrl}
                        jobs={detailJobs}
                        isLoading={isLoadingDetail}
                        onClose={() => setSelectedUrl(null)}
                    />
                </main>
            )}
        </div>
    );
}

// helper used in App — imported from localStorage
import { getToken } from "./api/client";

export default App;
