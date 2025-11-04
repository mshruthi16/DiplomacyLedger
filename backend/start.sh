#!/usr/bin/env bash
# start.sh
# Forces Gunicorn to bind to the port assigned by the hosting environment ($PORT)
gunicorn app:app --bind 0.0.0.0:$PORT