"""Root entry point for Railway — imports from api/main.py."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
from api.main import app
