import requests

def fetch_iframe_data(internal_id):
    # The URL explicitly requires the ID and the prod-standard flag
    url = f"https://www.dlpartscolookup.com/lookup/{internal_id}?site=prod-standard"
    
    # Spoof the headers to mimic an iframe embedded on D&L Parts Co
    headers = {
        "Referer": "https://www.dlpartsco.com/",
        "Origin": "https://www.dlpartsco.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Sec-Fetch-Dest": "iframe",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-Mode": "navigate"
    }
    
    response = requests.get(url, headers=headers)
    
    print(f"Status Code: {response.status_code}")
    
    # Dump the raw HTML output to a file so you can map the JSON schema or table structure
    with open("iframe_dump.html", "w", encoding="utf-8") as f:
        f.write(response.text)
        
    print("Payload dumped to iframe_dump.html")

if __name__ == "__main__":
    fetch_iframe_data("236142")
