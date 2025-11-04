#!/usr/bin/env bash

# 1. Force install gunicorn now, just before starting the app.
pip install gunicorn

# 2. Use the python interpreter from the virtual environment path to run gunicorn
# This is the path Render gives us.
/opt/render/project/src/.venv/bin/python -m gunicorn app:app --bind 0.0.0.0:$PORT
