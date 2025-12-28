import google.generativeai as genai
import os
load_dotenv()
# Access the key safely
GENAI_API_KEY = os.getenv("GENAI_API_KEY")
if not GENAI_API_KEY:
    raise ValueError("API Key not found. Make sure it is set in your .env file.")
genai.configure(GENAI_API_KEY)
def test_gemini():
    
    try:
        print("Listing models...")
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                print(m.name)
                
        print("Creating dummy file...")
        with open("test.txt", "w") as f:
            f.write("This is a test file.")
            
        print("Uploading file...")
        myfile = genai.upload_file("test.txt")
        print(f"File uploaded: {myfile.name}")
        
        print("Generating content...")
        model = genai.GenerativeModel("gemini-1.5-flash-latest")
        response = model.generate_content([myfile, "Explain this file."])
        print(f"Response: {response.text}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_gemini()
