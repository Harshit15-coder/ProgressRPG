#!/bin/sh
set -e
python manage.py check --deploy
python manage.py migrate
