#!/usr/bin/env bash

# This script forces the installation of all core modules directly 
# within the execution environment path for maximum reliability.

# 1. Force install all dependencies
# We use the venv's Python to ensure installation into the correct environment.
/opt/render/project/src/.venv/bin/python -m pip install flask gunicorn flask-cors supabase python-dotenv

# 2. Run the application using the guaranteed-path Python interpreter
/opt/render/project/src/.venv/bin/python -m gunicorn app:app --bind 0.0.0.0:$PORT