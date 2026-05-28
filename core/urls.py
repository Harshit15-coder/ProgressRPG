from django.urls import path

from .views import stored_file_view

app_name = "core"

urlpatterns = [
    path("stored/<uuid:pk>/", stored_file_view, name="stored-file"),
]
