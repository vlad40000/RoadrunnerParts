from bs4 import BeautifulSoup
from typing import List, Dict, Any

def parse_encompass_model_page(html: str) -> Dict[str, Any]:
    soup = BeautifulSoup(html, 'lxml')
    
    results = {
        "brand": None,
        "product_type": None,
        "assemblies": []
    }
    
    # Example parsing logic for Encompass
    # brand = soup.select_one(".brand-name")
    # assemblies = soup.select(".assembly-link")
    
    # For now, return a structure that the worker can use
    return results

def parse_encompass_parts_list(html: str) -> List[Dict[str, Any]]:
    soup = BeautifulSoup(html, 'lxml')
    parts = []
    
    # Locate parts table
    rows = soup.select("tr.part-row") # Example selector
    for row in rows:
        # Extract columns
        part_num = row.select_one(".part-number-cell")
        desc = row.select_one(".description-cell")
        if part_num:
            parts.append({
                "part_number": part_num.text.strip(),
                "description": desc.text.strip() if desc else None,
            })
            
    return parts
