import datetime
from typing import Optional, Dict, Any
from db import get_connection

def claim_job(worker_id: str) -> Optional[Dict[str, Any]]:
    """
    Find and lock a queued job using a transaction for safety.
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Atomic claim using FOR UPDATE SKIP LOCKED
            cur.execute("""
                UPDATE retrieval_jobs
                SET status = 'running',
                    locked_at = %s,
                    locked_by = %s,
                    started_at = %s,
                    attempt_count = attempt_count + 1
                WHERE id IN (
                    SELECT id FROM retrieval_jobs
                    WHERE status = 'queued'
                    ORDER BY priority DESC, created_at ASC
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING *;
            """, (datetime.datetime.now(), worker_id, datetime.datetime.now()))
            return cur.fetchone()

def mark_complete(job_id: str, metadata: Optional[Dict[str, Any]] = None):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE retrieval_jobs
                SET status = 'completed',
                    finished_at = %s,
                    metadata = COALESCE(metadata, '{}'::jsonb) || %s
                WHERE id = %s;
            """, (datetime.datetime.now(), metadata or {}, job_id))

def mark_failed(job_id: str, error: str, metadata: Optional[Dict[str, Any]] = None):
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Check if we should retry
            cur.execute("SELECT attempt_count, max_attempts FROM retrieval_jobs WHERE id = %s", (job_id,))
            job = cur.fetchone()
            
            new_status = 'failed'
            if job and job['attempt_count'] < job['max_attempts']:
                new_status = 'queued' # Re-queue for retry
                
            cur.execute("""
                UPDATE retrieval_jobs
                SET status = %s,
                    error = %s,
                    finished_at = %s,
                    locked_at = NULL,
                    locked_by = NULL,
                    metadata = COALESCE(metadata, '{}'::jsonb) || %s
                WHERE id = %s;
            """, (new_status, error, datetime.datetime.now(), metadata or {}, job_id))

def run_handler(job: Dict[str, Any]):
    """
    Dispatches the job to the appropriate service logic.
    """
    job_type = job.get('job_type')
    print(f"Running job {job['id']} of type {job_type}")
    
    # This will be expanded in Tasks 5-8
    if job_type == 'full_bom_retrieval':
        # 1. build urls
        # 2. capture static
        # 3. capture rendered
        # 4. parse
        # 5. validate
        # 6. write results
        pass
    else:
        raise ValueError(f"Unknown job type: {job_type}")
