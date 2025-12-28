import os
import tempfile
import json
import re
import requests
import threading
from flask import Flask, render_template, request, jsonify
from bs4 import BeautifulSoup
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

# Ensure Flask never returns HTML error pages
app.config['PROPAGATE_EXCEPTIONS'] = False
app.config['TRAP_HTTP_EXCEPTIONS'] = True

# Configure Gemini API
GENAI_API_KEY = os.getenv('GENAI_API_KEY')
if not GENAI_API_KEY:
    raise ValueError("GENAI_API_KEY not found in environment variables. Please set it in your .env file.")
genai.configure(api_key=GENAI_API_KEY)

# Configure cache backend (Redis for production, file for local dev)
CACHE_FILE = 'notes_cache.json'
REDIS_URL = os.getenv('REDIS_URL')  # Render provides this automatically for Redis services

# Try to initialize Redis, fallback to file-based cache
redis_client = None
if REDIS_URL:
    try:
        import redis
        redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        # Test connection
        redis_client.ping()
        print("Using Redis for cache storage")
    except Exception as e:
        print(f"Failed to connect to Redis: {e}. Falling back to file-based cache.")
        redis_client = None
else:
    print("No REDIS_URL found. Using file-based cache.")

# Lock to ensure only one MP3 is processed at a time (reduces storage overhead)
processing_lock = threading.Lock()

def clean_latex_formatting(text):
    """Removes LaTeX formatting like $\text{...}$ from the text."""
    # Remove $\text{...}$ and replace with just the content inside
    text = re.sub(r'\$\\text\{([^}]*)\}\$', r'\1', text)
    # Also handle \\text{...} without dollar signs
    text = re.sub(r'\\text\{([^}]*)\}', r'\1', text)
    # Remove any remaining single $ signs (inline math)
    text = re.sub(r'\$([^$]*)\$', r'\1', text)
    return text

def get_cached_notes(lecture_id):
    """Get cached notes for a specific lecture ID.
    Uses Redis if available, otherwise falls back to file-based cache.
    """
    if redis_client:
        try:
            notes = redis_client.get(f'lecture:{lecture_id}')
            return notes if notes else None
        except Exception as e:
            print(f"Error getting from Redis: {e}")
            # Fallback to file-based cache
            cache = load_cache()
            return cache.get(lecture_id)
    else:
        # File-based cache
        cache = load_cache()
        return cache.get(lecture_id)

def set_cached_notes(lecture_id, notes):
    """Set cached notes for a specific lecture ID.
    Uses Redis if available, otherwise falls back to file-based cache.
    """
    if redis_client:
        try:
            redis_client.set(f'lecture:{lecture_id}', notes)
            return True
        except Exception as e:
            print(f"Error setting in Redis: {e}")
            # Fallback to file-based cache
            return set_cached_notes_file(lecture_id, notes)
    else:
        # File-based cache
        return set_cached_notes_file(lecture_id, notes)

def load_cache():
    """Load entire cache from file (used as fallback for file-based operations)."""
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading cache file: {e}")
            return {}
    return {}

def set_cached_notes_file(lecture_id, notes):
    """Helper function to save to file-based cache."""
    try:
        cache = load_cache()
        cache[lecture_id] = notes
        with open(CACHE_FILE, 'w') as f:
            json.dump(cache, f)
        return True
    except Exception as e:
        print(f"Error saving to cache file: {e}")
        return False

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
                return a['href']
        
        # Strategy 2: Look for audio tag source
        audio = soup.find('audio')
        if audio and audio.get('src'):
            return audio['src']
        
        return None
    except Exception as e:
        print(f"Error getting MP3 URL: {e}")
        return None

def generate_cache_key(url, request_type='notes'):
    """Generates a cache key from the URL and request type.
    Format: yutorah_{id}_{type}
    Example: yutorah_1154805_notes
    """
    import re
    # Extract just the lecture ID number from various URL patterns
    match = re.search(r'/(?:lectures|sidebar/lecturedata|lecture\.cfm)/(\d+)', url)
    if match:
        lecture_id = match.group(1)
        return f"yutorah_{lecture_id}_{request_type}"
    return None

def normalize_yutorah_url(url):
    """Normalizes any YUTorah URL to the standard format: https://www.yutorah.org/lectures/{lecture_id}"""
    import re
    match = re.search(r'/(?:lectures|sidebar/lecturedata|lecture\.cfm)/(\d+)', url)
    if match:
        return f"https://www.yutorah.org/lectures/{match.group(1)}"
    return None


# Global exception handler to ensure JSON responses
@app.errorhandler(Exception)
def handle_exception(e):
    """Catch all exceptions and return JSON instead of HTML."""
    print(f"Unhandled exception: {e}")
    return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal Server Error'}), 500

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/process', methods=['POST'])
def process_shiur():
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        page_url = data.get('url')
        request_type = data.get('type', 'notes')  # Default to 'notes'
    except Exception:
        return jsonify({'error': 'Invalid JSON data'}), 400
    
    if not page_url:
        return jsonify({'error': 'No URL provided'}), 400
    
    if request_type not in ['notes', 'transcript']:
        return jsonify({'error': 'Invalid request type. Must be "notes" or "transcript".'}), 400
    
    # Generate cache key
    cache_key = generate_cache_key(page_url, request_type)
    if not cache_key:
        return jsonify({'error': 'Invalid YUTorah URL format'}), 400
    
    # Check cache
    try:
        cached_content = get_cached_notes(cache_key)
        if cached_content:
            print(f"Returning cached {request_type} for key: {cache_key}")
            cleaned_content = clean_latex_formatting(cached_content)
            return jsonify({'notes': cleaned_content, 'cached': True})
    except Exception as e:
        print(f"Cache error: {e}")
        # Continue processing if cache fails
    
    # Acquire lock to ensure only one MP3 is processed at a time
    if not processing_lock.acquire(blocking=False):
        return jsonify({'error': 'Server is currently processing another request. Please try again in a moment.'}), 503
    
    try:
        # 1. Get MP3 URL
        mp3_url = get_mp3_url(page_url)
        if not mp3_url:
            return jsonify({'error': 'Could not find MP3 link on the page'}), 404
            
        print(f"Found MP3 URL: {mp3_url}")
        
        # 2. Download MP3 to temp file in /tmp/ (Render-compatible)
        temp_dir = '/tmp' if os.path.exists('/tmp') else None
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3', dir=temp_dir) as temp_mp3:
            print("Downloading MP3...")
            with requests.get(mp3_url, stream=True) as r:
                r.raise_for_status()
                # Stream in larger chunks for better performance
                for chunk in r.iter_content(chunk_size=1024*1024):  # 1MB chunks
                    if chunk:  # filter out keep-alive new chunks
                        temp_mp3.write(chunk)
            temp_mp3_path = temp_mp3.name
            
        try:
            # 3. Upload to Gemini
            print("Uploading to Gemini...")
            myfile = genai.upload_file(temp_mp3_path)
            
            # 4. Generate Content
            print(f"Generating {request_type}...")
            model = genai.GenerativeModel("gemini-flash-latest")
            
            if request_type == 'transcript':
                prompt = """Generate a verbatim or near-verbatim transcript of this audio file.
Follow these rules strictly:
1. Identify speakers if possible (e.g., "Speaker:", "Audience:").
2. Write Hebrew terms in Hebrew script (do not translate or transliterate them).
3. Use paragraph breaks to indicate changes in topic or speaker.
4. Do not add any summary, analysis, or preamble. Just the transcript.
5. If the audio is unclear, mark it as [inaudible].

If you cannot access or process the audio, respond with exactly: "ERROR: Unable to process audio file."""
            else:
                # Default to notes
                prompt = """Take extensive and clear notes on this shiur in markdown format. Follow these rules strictly:

1. **LANGUAGE REQUIREMENT**: Write ALL explanatory content, descriptions, and notes in ENGLISH ONLY.
2. **HEBREW TERMS**: Write Hebrew terms, phrases, and quotations in Hebrew script only (do NOT translate or transliterate them into English).
3. NEVER use HTML tags - use ONLY markdown syntax (plain text with markdown formatting)
4. Use consistent markdown formatting:
   - Use ## for main section headers
   - Use ### for subsection headers
   - Use bullet points (-) for lists
   - Use **bold** for key terms and concepts
   - Use > for important quotes or principles
5. Organize the notes with clear sections
6. Be comprehensive and capture all important points
7. Return ONLY the formatted notes, no preamble or meta-commentary

**CRITICAL**: All notes must be in English except for Hebrew terms which must remain in Hebrew script.

If you cannot access or process the audio, respond with exactly: "ERROR: Unable to process audio file.\""""
            
            try:
                result = model.generate_content([myfile, prompt])
                generated_text = result.text
            except ValueError:
                 # This usually happens if the model blocks the response or returns no text
                return jsonify({'error': "Could not process this audio. The audio may be too long, corrupted, or contain content that cannot be processed."}), 422
            except Exception as e:
                return jsonify({'error': f"Failed to generate content: {str(e)}"}), 500
            
            # Clean LaTeX formatting
            cleaned_text = clean_latex_formatting(generated_text)
            
            # Save to cache
            try:
                set_cached_notes(cache_key, cleaned_text)
            except Exception as e:
                print(f"Error saving to cache: {e}")
            
            return jsonify({'notes': cleaned_text, 'cached': False})
            
        finally:
            # Cleanup temp file
            if os.path.exists(temp_mp3_path):
                os.unlink(temp_mp3_path)
                
    except Exception as e:
        print(f"Error processing: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        # Always release the lock
        processing_lock.release()

if __name__ == '__main__':
    # Disable debug mode in production to prevent HTML error pages
    app.run(debug=False, port=5000)
