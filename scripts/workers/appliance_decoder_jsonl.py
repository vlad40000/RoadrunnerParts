#!/usr/bin/env python3
import sys
import json
import logging
from appliance_decoder_patched import ApplianceDateDecoder, TimeUnit

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)

def process_line(decoder, line: str):
    try:
        data = json.loads(line)
        brand_family = data.get("brand_family")
        serial = data.get("serial")
        model = data.get("model", "")
        features = data.get("features", [])
        refrigerant = data.get("refrigerant", "")
        
        if not brand_family or not serial:
            return {"error": "Missing brand_family or serial", "input": data}
            
        result = decoder.decode(
            brand_family=brand_family,
            serial=serial,
            model=model,
            observed_features=features,
            refrigerant_label=refrigerant
        )
        
        # Serialize the TimeValue object if it exists
        time_val = None
        if result.month_or_week:
            time_val = {
                "value": result.month_or_week.value,
                "unit": result.month_or_week.unit.value
            }
            
        output = {
            **data,
            "decode_result": {
                "selected_year": result.selected_year,
                "time_value": time_val,
                "confidence": result.confidence,
                "resolution_reason": result.resolution_reason,
                "rules_applied": result.rules_applied,
                "candidates_before": result.candidates_before,
                "remaining_candidates": result.remaining_candidates
            }
        }
        return output
    except Exception as e:
        logging.error(f"Error processing line: {e}")
        return {"error": str(e), "line": line}

def main():
    logging.info("Appliance Decoder JSONL worker starting...")
    decoder = ApplianceDateDecoder()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        result = process_line(decoder, line)
        print(json.dumps(result))
        sys.stdout.flush()

if __name__ == "__main__":
    main()
