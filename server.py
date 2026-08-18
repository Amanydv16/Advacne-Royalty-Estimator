"""
Server entrypoint for Advance Royalty Calculator & Valuation Engine.
Runs the FastAPI backend and serves the interactive frontend on port 8000.
"""
import sys
from pathlib import Path
import uvicorn

# Ensure workspace root is in sys.path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.api.main import app

if __name__ == "__main__":
    print("\n========================================================")
    print(" ADVANCE ROYALTY CALCULATOR & VALUATION ENGINE")
    print(" Web App: http://localhost:8050")
    print(" API Docs: http://localhost:8050/docs")
    print("========================================================\n")
    uvicorn.run(app, host="127.0.0.1", port=8050, log_level="info")


