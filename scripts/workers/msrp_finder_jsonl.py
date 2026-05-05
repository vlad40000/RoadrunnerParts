#!/usr/bin/env python3
import sys
import json
import logging
from msrp_original_finder_patched import find_original_msrp_for_model

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)

def process_line(line: str):
    try:
        data = json.loads(line)
        model = data.get("model")
        target_date = data.get("target_date")
        mfr_domains = data.get("mfr_domains", [])
        mfr_product_urls = data.get("mfr_product_urls", [])
        
        if not model or not target_date:
            return {"error": "Missing model or target_date", "input": data}
            
        result = find_original_msrp_for_model(
            model=model,
            target_date_s=target_date,
            mfr_domains=mfr_domains,
            mfr_product_urls=mfr_product_urls,
            window_days_before=365,
            window_days_after=365,
            cdx_limit_per_url=25,
            sleep_s=0.5
        )
        
        # Merge input data with results
        output = {**data, "msrp_result": {
            "msrp": result.msrp,
            "currency": result.currency,
            "confidence": result.confidence,
            "note": result.note,
            "chosen": result.chosen
        }}
        return output
    except Exception as e:
        logging.error(f"Error processing line: {e}")
        return {"error": str(e), "line": line}

def main():
    logging.info("MSRP Finder JSONL worker starting...")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        result = process_line(line)
        print(json.dumps(result))
        sys.stdout.flush()

if __name__ == "__main__":
    main()
