// In-memory job store for CTI report generation.
//
// Reports are generated asynchronously (the LLM takes 30-90s). We can't use
// streaming through the Caddy gateway because the browser disconnects
// mid-stream. Instead:
//   1. POST /api/cti-reports/generate starts a job, returns jobId immediately
//   2. GET /api/cti-reports/status?jobId=xxx polls until status="complete"
//   3. GET /api/cti-reports/result?jobId=xxx returns the full report
//
// Jobs are stored in memory and expire after 10 minutes.

export type JobStatus = "pending" | "complete" | "error";

export type ReportJob = {
  id: string;
  status: JobStatus;
  startedAt: number;
  completedAt: number | null;
  report: unknown | null;
  error: string | null;
  progress: string; // partial content for live preview
};

const JOBS = new Map<string, ReportJob>();
const JOB_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Clean up expired jobs periodically
function cleanupExpired() {
  const now = Date.now();
  for (const [id, job] of JOBS) {
    if (now - job.startedAt > JOB_TTL_MS) {
      JOBS.delete(id);
    }
  }
}

export function createJob(): ReportJob {
  cleanupExpired();
  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job: ReportJob = {
    id,
    status: "pending",
    startedAt: Date.now(),
    completedAt: null,
    report: null,
    error: null,
    progress: "",
  };
  JOBS.set(id, job);
  return job;
}

export function getJob(id: string): ReportJob | undefined {
  return JOBS.get(id);
}

export function updateJobProgress(id: string, progress: string) {
  const job = JOBS.get(id);
  if (job) job.progress = progress;
}

export function completeJob(id: string, report: unknown) {
  const job = JOBS.get(id);
  if (job) {
    job.status = "complete";
    job.completedAt = Date.now();
    job.report = report;
    job.progress = "";
  }
}

export function failJob(id: string, error: string) {
  const job = JOBS.get(id);
  if (job) {
    job.status = "error";
    job.completedAt = Date.now();
    job.error = error;
    job.progress = "";
  }
}
