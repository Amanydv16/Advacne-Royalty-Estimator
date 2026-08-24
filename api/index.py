import sys
from pathlib import Path

# Ensure workspace root is in python module search path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.api.main import app

# Expose app handler for Vercel Serverless Functions
handler = app
