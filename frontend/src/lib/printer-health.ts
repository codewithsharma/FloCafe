import api from './api';

export type PrintHealthOverall = 'healthy' | 'degraded' | 'error' | 'unknown';

export type PrintHealthJob = {
  id: string;
  job_type: string;
  status: string;
  bill_id: number | null;
  order_id: number | null;
  attempts: number;
  max_attempts: number;
  retries_remaining: number;
  retryable: boolean;
  exhausted: boolean;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  has_prior_print_log: boolean;
};

export type PrintHealthPayload = {
  overall: PrintHealthOverall;
  semantics: Record<string, string>;
  default_printer: {
    present: boolean;
    id: string | null;
    name: string | null;
    connection_type: string | null;
  };
  queue: {
    open_count: number;
    pending_count: number;
    failed_count: number;
    retryable_count: number;
    exhausted_count: number;
    oldest_open_at: string | null;
  };
  jobs: PrintHealthJob[];
};

export async function fetchPrinterHealth(): Promise<PrintHealthPayload> {
  const res = await api.get<{ health: PrintHealthPayload }>('/printers/health');
  return res.data.health;
}

export async function retryPrintJob(jobId: string): Promise<{
  success: boolean;
  job: PrintHealthJob & { last_error?: string | null };
}> {
  const res = await api.post(`/printers/jobs/${encodeURIComponent(jobId)}/retry`);
  return res.data;
}
