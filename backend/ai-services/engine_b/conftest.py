import os
import sys

# Ensure the project root (where main.py lives) is importable from tests/,
# since pytest by default only adds the test file's own directory to sys.path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
