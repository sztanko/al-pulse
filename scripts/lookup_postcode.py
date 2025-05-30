import requests
from bs4 import BeautifulSoup
from typing import Optional, Dict
import logging
from tenacity import (
    retry,
    stop_after_attempt,
    retry_if_exception_type,
    wait_random_exponential,
)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

@retry(
    stop=stop_after_attempt(5),
    wait=wait_random_exponential(multiplier=1.2, min=5, max=30),
    retry=retry_if_exception_type(Exception),
    reraise=True,
)
def lookup_postcode(postcode: str) -> Optional[Dict[str, str]]:
    """
    Look up Portuguese postcode details from codigo-postal.pt.
    
    Args:
        postcode (str): A Portuguese postcode, e.g., "8400-010".
        
    Returns:
        dict with keys: title, district, municipality, locality, postcode, lat, lon;
        or None if not found.
    """
    if '-' not in postcode:
        log.warning("Invalid postcode format")
        return None

    cp4, cp3 = postcode.split('-')

    url = f"https://www.codigo-postal.pt/?cp4={cp4}&cp3={cp3}"
    log.info(f"Requesting URL: {url}")
    resp = requests.get(url, timeout=10)

    if not resp.ok:
        log.warning("Failed to fetch page")
        return None

    soup = BeautifulSoup(resp.text, 'html.parser')
    place_div = soup.find('div', class_='places')
    if not place_div:
        return None

    try:
        title_elem = place_div.select_one('a.search-title')
        cp_elem = place_div.select_one('span.cp')
        gps_elem = place_div.select_one('span.gps')
        local_elem = place_div.select_one('span.local')

        if not all([title_elem, cp_elem, gps_elem, local_elem]):
            return None
        if gps_elem.text:
            # log.info(f"GPS data found: {gps_elem.text}")
            result = gps_elem.text.replace("GPS:", "").strip().split(',')
            if len(result) == 2:
                lat, lng = map(str.strip, result)
            else:
                log.warning(f"GPS format is incorrect: {gps_elem.text}")
                lat, lng = None, None
        else:
            lat, lng = None, None
        # log.info(local_elem)
        if local_elem:
            locality_info = local_elem.text.strip().split(',')
        else:
            locality_info = []
        if len(locality_info) < 2:
            return None
        if len(locality_info) == 2:
            municipality, district = map(str.strip, locality_info)
            locality = municipality
        if len(locality_info) == 3:
            locality, municipality, district = map(str.strip, locality_info)

        out= {
            "title": title_elem.text.strip(),
            "returned_postal_code": cp_elem.text.strip(),
            "district": district,
            "municipality": municipality,
            "locality": locality,
            "lat": lat,
            "lng": lng,
        }
        log.info(f"Parsed data: {out}")
        return out

    except Exception as e:
        log.exception("Parsing error")
        return None

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        print("Usage: python lookup_postcode.py <postcode>")
        sys.exit(1)

    postcode = sys.argv[1]
    result = lookup_postcode(postcode)
    if result:
        for key, value in result.items():
            print(f"{key}: {value}")
    else:
        print("Postcode not found or invalid format.")