#!/usr/bin/env bash
# Forces Gunicorn to bind to the port assigned by the hosting environment ($PORT)
# It uses 'python -m gunicorn' to ensure the executable is found inside the venv.
python -m gunicorn app:app --bind 0.0.0.0:$PORT
