import requests
from bs4 import BeautifulSoup

def get_mp3_url(page_url):
    """Scrapes the Yutorah page to find the MP3 download link."""
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        response = requests.get(page_url, headers=headers)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Strategy 1: Look for a link that ends with .mp3
        for a in soup.find_all('a', href=True):
            if a['href'].strip().lower().endswith('.mp3'):
                print(f"Found via Strategy 1: {a['href']}")
                return a['href']
        
        # Strategy 2: Look for audio tag source
        audio = soup.find('audio')
        if audio and audio.get('src'):
            print(f"Found via Strategy 2: {audio['src']}")
            return audio['src']
            
        print("Not found")
        return None
    except Exception as e:
        print(f"Error scraping URL: {e}")
        return None

url = "https://www.yutorah.org/lectures/1150968/It's-Dark-Outside,-But-It's-Light-in-Here:-Engendering-an-Environment-of-Positive-Energy"
print(f"Testing URL: {url}")
get_mp3_url(url)
