#!/bin/sh
set -e
python manage.py collectstatic --noinput --clear
python manage.py migrate
