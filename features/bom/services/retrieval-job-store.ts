export type EncompassRetrievalJobInput = {
    bomJobId?: string | null;
    jobId?: string | null;
    model?: string | null;
    modelNumber?: string | null;
    brand?: string | null;
    serialNumber?: string | null;
    sourceUrl?: string | null;
    canonUrl?: string | null;
    assemblyUrls?: string[];
    requestedBy?: string | null;
    metadata?: Record<string, unknown>;
};

export type EncompassRetrievalJob = EncompassRetrievalJobInput & {
    id: string;
    status: "queued";
    createdAt: string;
};

const jobs: EncompassRetrievalJob[] = [];

export async function enqueueEncompassRetrievalJob(
    input: EncompassRetrievalJobInput
): Promise<EncompassRetrievalJob> {
    const job: EncompassRetrievalJob = {
        ...input,
        id: crypto.randomUUID(),
        status: "queued",
        createdAt: new Date().toISOString(),
    };

    jobs.push(job);
    return job;
}

export function listEncompassRetrievalJobs(): EncompassRetrievalJob[] {
    return jobs;
}