import argparse
import time
import uuid
import os
from dotenv import load_dotenv

from db import get_connection

load_dotenv()

WORKER_ID = f"bom-worker-py-{uuid.uuid4().hex[:8]}"
POLL_SECONDS = float(os.getenv("WORKER_POLL_SECONDS", "5"))

def main():
    parser = argparse.ArgumentParser(description="DB-first Encompass BOM retrieval worker")
    parser.add_argument("--once", action="store_true", help="Process at most one queued job")
    args = parser.parse_args()

    print(f"[{WORKER_ID}] Python BOM retrieval worker active (Modular Architecture)")
    while True:
        # job processing logic moved to jobs.py
        worked = False # process_once()
        if args.once:
            return
        if not worked:
            time.sleep(POLL_SECONDS)

if __name__ == "__main__":
    main()
